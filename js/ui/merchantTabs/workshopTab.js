// js/ui/merchantTabs/workshopTab.js
import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, CURRENCIES, getActiveSlot } from '../../util/storage.js';
import { registerTick } from '../../game/gameLoop.js';
import { openShop, playPurchaseSfx } from '../shopOverlay.js';
import { hasDoneInfuseReset } from './resetTab.js';
import { bigNumFromLog10, getLevelNumber } from '../../game/upgrades.js';
import { IS_MOBILE } from '../../main.js';
import { AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID } from '../../game/automationUpgrades.js';

const GEAR_ICON_SRC = 'img/currencies/gear/gear.webp';
const GEAR_HUD_ICON_SRC = 'img/currencies/gear/gear_plus_base.webp';
const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';

const MAX_GEAR_DECORATIONS = 100;

let workshopEl = null;
let initialized = false;
let accumulatorBuffer = 0; 
let currentGenerationLevel = 0;
let lastSyncedLevel = -1;
let renderFrameId = null;

// Upgrade Constants
const GENERATION_UPGRADE_BASE_COST_LOG = 12; // 1T = 1e12
const LOG10_2 = 0.3010299956639812; 

// Scaling Thresholds & Constants
const L1 = 1e6;
const L2 = 1e9;
const L3 = 1e12;

const BASE_MULT_LOG = 1; // log10(10)
const K_LIN = 0.001;
const EXP_DIV = 1000;
const LOG_EXP_BASE = Math.log10(1.00001);

// S4 Constants
const S4_A = 1.00001;
const S4_B = 0.00001;

// Precomputed Constants
const LN10 = Math.log(10);
const INV_LN10 = 1 / LN10;

// Helper Integrals
function integralLogLin(x, k) {
    if (x <= 0) return 0;
    const term = 1 + k * x;
    const val = (term * Math.log(term) - k * x) / k;
    return val * INV_LN10;
}

function integralWLogLin(w, a, b) {
    if (w <= 0) return 0;
    const term = a + b * w;
    const lnTerm = Math.log(term);
    const w2 = w * w;
    const a2_2b2 = (a * a) / (2 * b * b);
    const a_2b = a / (2 * b);
    const part1 = (w2 / 2 - a2_2b2) * lnTerm;
    const part2 = -w2 / 4 + a_2b * w;
    return (part1 + part2) * INV_LN10;
}

// Precompute S4 Offset (F(0))
const S4_OFFSET = (() => {
    const a = S4_A, b = S4_B;
    const a2_2b2 = (a*a)/(2*b*b);
    const ln_a = Math.log(a);
    return (-a2_2b2 * ln_a) * INV_LN10;
})();

// Lazy Caches
let CACHE_S1_END_LOG = null;
let CACHE_S2_END_LOG = null;
let CACHE_S3_END_LOG = null;
let CACHE_RATIO_LOG_AT_L3 = null;

export function getGenerationLevelKey(slot) {
  return `ccc:workshop:genLevel:${slot}`;
}

const animatedGears = new Map(); 

// Config
const GEAR_SPEED = 67; 
const GEAR_ROTATION_SPEED_BASE = 67; 
const GEAR_ROTATION_VARIANCE = 67; 

function loadGenerationLevel() {
  const slot = getActiveSlot();
  if (!slot) return 0;
  const raw = localStorage.getItem(getGenerationLevelKey(slot));
  const val = parseFloat(raw || '0');
  if (!Number.isFinite(val)) {
    if (val === Infinity || val === -Infinity) return val;
  }
  return Number.isFinite(val) ? val : 0;
}

function saveGenerationLevel(level) {
  const slot = getActiveSlot();
  if (!slot) return false;
  const key = getGenerationLevelKey(slot);
  const valStr = String(level);
  try {
    localStorage.setItem(key, valStr);
  } catch {}
  let readBack = null;
  try {
    readBack = localStorage.getItem(key);
  } catch {}
  return readBack === valStr;
}

function calculateWorkshopCostLog(level) {
    if (level <= 0) return GENERATION_UPGRADE_BASE_COST_LOG;
    if (level === Infinity) return Infinity;

    // S1
    if (level <= L1) {
        return GENERATION_UPGRADE_BASE_COST_LOG + level * BASE_MULT_LOG;
    }
    
    if (CACHE_S1_END_LOG === null) {
        CACHE_S1_END_LOG = GENERATION_UPGRADE_BASE_COST_LOG + L1 * BASE_MULT_LOG;
    }

    // S2
    const u = level - L1;
    if (level <= L2) {
        return CACHE_S1_END_LOG + u + integralLogLin(u, K_LIN);
    }

    if (CACHE_S2_END_LOG === null) {
        const u2 = L2 - L1;
        CACHE_S2_END_LOG = CACHE_S1_END_LOG + u2 + integralLogLin(u2, K_LIN);
    }

    // S3
    const v = level - L2;
    const u_at_L = level - L1;
    const u_at_L2 = L2 - L1;
    
    // Delta S2 integral + S3 quadratic term
    const s2_continuation = v + (integralLogLin(u_at_L, K_LIN) - integralLogLin(u_at_L2, K_LIN));
    const C3 = LOG_EXP_BASE / EXP_DIV;
    const s3_extra = 0.5 * C3 * v * v;
    
    if (level <= L3) {
        return CACHE_S2_END_LOG + s2_continuation + s3_extra;
    }

    if (CACHE_S3_END_LOG === null) {
        const v3 = L3 - L2;
        const u3 = L3 - L1;
        const s2_cont_3 = v3 + (integralLogLin(u3, K_LIN) - integralLogLin(u_at_L2, K_LIN));
        const s3_extra_3 = 0.5 * C3 * v3 * v3;
        CACHE_S3_END_LOG = CACHE_S2_END_LOG + s2_cont_3 + s3_extra_3;
    }
    
    if (CACHE_RATIO_LOG_AT_L3 === null) {
        const term1 = 1 + K_LIN * (L3 - L1);
        const term2_exp = (L3 - L2) / EXP_DIV;
        CACHE_RATIO_LOG_AT_L3 = 1 + Math.log10(term1) + term2_exp * LOG_EXP_BASE;
    }

    // S4
    const w_raw = (level - L3) / EXP_DIV;
    const term_const = w_raw * EXP_DIV * CACHE_RATIO_LOG_AT_L3;
    const term_dynamic = (integralWLogLin(w_raw, S4_A, S4_B) - S4_OFFSET) * EXP_DIV;

    return CACHE_S3_END_LOG + term_const + term_dynamic;
}

function getGenerationUpgradeCost(level) {
  if (!Number.isFinite(level)) return BigNum.fromAny('Infinity');
  const logCost = calculateWorkshopCostLog(level);
  if (logCost >= 9e15) return BigNum.fromAny('Infinity');
  return bigNumFromLog10(logCost);
}

function getGearsPerSecond(level) {
  let baseRate;
  if (level === 0) {
    baseRate = BigNum.fromInt(1);
  } else if (!Number.isFinite(level)) {
    baseRate = BigNum.fromAny('Infinity');
  } else {
    const logValue = level * LOG10_2;
    baseRate = bigNumFromLog10(logValue);
  }
  const mult = bank?.gears?.mult?.get?.() ?? BigNum.fromInt(1);
  return baseRate.mulBigNumInteger(mult);
}

function buyGenerationUpgrade() {
  const cost = getGenerationUpgradeCost(currentGenerationLevel);
  if (bank.coins.value.cmp(cost) < 0) return;
  const nextLevel = currentGenerationLevel + 1;
  if (saveGenerationLevel(nextLevel)) {
    currentGenerationLevel = nextLevel;
    bank.coins.sub(cost);
    updateWorkshopTab();
    playPurchaseSfx();
  }
}

function onTick() {
  if (!hasDoneInfuseReset()) return;
  const rateBn = getGearsPerSecond(currentGenerationLevel);
  const perTick = rateBn.mulDecimal('0.05');
  const whole = perTick.floorToInteger();
  const hasWhole = !whole.isZero();
  if (hasWhole) {
      if (bank.gears) bank.gears.add(whole);
  }
  if (currentGenerationLevel < 20) {
      const rateNum = Math.pow(2, currentGenerationLevel);
      const perTickNum = rateNum / 20;
      const wholeNum = Math.floor(perTickNum);
      const frac = perTickNum - wholeNum;
      accumulatorBuffer += frac;
      if (accumulatorBuffer >= 1) {
          const accWhole = Math.floor(accumulatorBuffer);
          accumulatorBuffer -= accWhole;
          if (bank.gears) bank.gears.add(accWhole);
      }
  } else {
      accumulatorBuffer = 0;
  }
}

function resetWorkshopState() {
    if (bank.gears) bank.gears.set(0);
    if (saveGenerationLevel(0)) {
        currentGenerationLevel = 0;
    }
    accumulatorBuffer = 0;
    updateWorkshopTab();
}

function syncGearDecorations(container) {
  if (!container) return;
  let entry = animatedGears.get(container);
  if (!entry) {
    const rect = container.getBoundingClientRect();
    entry = { gears: [], width: rect.width, height: rect.height, needsDistribution: !rect.width || !rect.height };
    animatedGears.set(container, entry);
  }
  const rect = container.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    entry.width = rect.width;
    entry.height = rect.height;
  }
  const targetCount = Math.min(Math.floor(currentGenerationLevel), MAX_GEAR_DECORATIONS);
  const gears = entry.gears;
  while (gears.length < targetCount) {
    const img = document.createElement('img');
    img.src = GEAR_ICON_SRC;
    img.classList.add('workshop-bg-gear');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    const size = 32 + Math.random() * 48;
    let x = 0;
    let y = 0;
    if (entry.width > 0 && entry.height > 0) {
      x = Math.random() * (entry.width - size);
      y = Math.random() * (entry.height - size);
      if (x < 0) x = 0;
      if (y < 0) y = 0;
    } else {
      entry.needsDistribution = true;
    }
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * GEAR_SPEED;
    const dy = Math.sin(angle) * GEAR_SPEED;
    const rotation = Math.random() * 360;
    const rotationSpeed = (Math.random() < 0.5 ? -1 : 1) * (GEAR_ROTATION_SPEED_BASE + Math.random() * GEAR_ROTATION_VARIANCE);
    img.style.width = `${size}px`;
    img.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
    img.style.willChange = 'transform';
    container.appendChild(img);
    gears.push({ element: img, x, y, dx, dy, rotation, rotationSpeed, size });
  }
  while (gears.length > targetCount) {
    const g = gears.pop();
    if (g.element.parentNode) g.element.parentNode.removeChild(g.element);
  }
}

function buildWorkshopUI(container) {
  let descText = 'Click the big red button below to open the Automation Shop';
  if (IS_MOBILE) {
    const isLargeScreen = Math.max(window.innerWidth, window.innerHeight) >= 900;
    descText = isLargeScreen 
      ? 'Tap the big red button below to open the Automation Shop'
      : 'Tap the big red button below (scroll if needed) to open the Automation Shop';
  }
  container.innerHTML = `
    <div class="merchant-workshop">
      <div class="workshop-side-col workshop-side-left"></div>
      <div class="workshop-center-col">
        <div class="workshop-info-panel">
          <div class="workshop-gear-hud">
            <img src="${GEAR_HUD_ICON_SRC}" class="workshop-gear-plus" alt="Gears">
            <div class="workshop-gear-bar">
              <span data-workshop="gears-amount" class="workshop-gear-amount">0</span>
            </div>
          </div>
          <div class="workshop-rate-display">
             (+<img src="${GEAR_ICON_SRC}" class="workshop-rate-icon" alt=""><span><span data-workshop="gears-rate">0</span>/sec)</span>
          </div>
          <div class="workshop-description">
            Spend Coins to increase your Workshop Level<br>
            Each increase of your Workshop Level will double the rate of Gear production<br>
            ${descText}<br>
            Spend Gears in the Automation Shop to unlock powerful automation upgrades<br>
			Automation upgrades will never be reset by any reset layer
          </div>
        </div>
        <div class="workshop-doubler-panel">
          <button class="workshop-upgrade-btn" data-workshop="upgrade-gen">
            <span class="workshop-upgrade-title">Increase Workshop Level</span>
            <span class="workshop-upgrade-cost">
               Cost: <img src="${COIN_ICON_SRC}" class="workshop-upgrade-cost-icon" alt="Coins">
               <span data-workshop="upgrade-cost">1T</span>
            </span>
          </button>
        </div>
        <button class="btn-automation-shop">Automation</button>
      </div>
      <div class="workshop-side-col workshop-side-right"></div>
    </div>
  `;
  const leftCol = container.querySelector('.workshop-side-left');
  const rightCol = container.querySelector('.workshop-side-right');
  const upgradeBtn = container.querySelector('[data-workshop="upgrade-gen"]');
  upgradeBtn.addEventListener('click', () => { buyGenerationUpgrade(); });
  const automationBtn = container.querySelector('.btn-automation-shop');
  automationBtn.addEventListener('click', () => { openShop('automation'); });
  const syncLayout = () => {
      const statsBtn = document.querySelector('.hud-bottom [data-btn="stats"]');
      if (statsBtn && automationBtn) {
          const rect = statsBtn.getBoundingClientRect();
          automationBtn.style.width = `${rect.width}px`;
          automationBtn.style.height = `${rect.height}px`;
          automationBtn.style.minWidth = '0';
          automationBtn.style.maxWidth = 'none';
      }
      if (workshopEl && workshopEl.isConnected) {
        const left = workshopEl.querySelector('.workshop-side-left');
        const right = workshopEl.querySelector('.workshop-side-right');
        const updateBounds = (col) => {
           if (!col) return;
           const entry = animatedGears.get(col);
           if (entry) {
             const rect = col.getBoundingClientRect();
             entry.width = rect.width;
             entry.height = rect.height;
             if (entry.needsDistribution && entry.width > 0 && entry.height > 0) {
                 entry.needsDistribution = false;
                 for (const g of entry.gears) {
                     g.x = Math.random() * (entry.width - g.size);
                     if (g.x < 0) g.x = 0;
                     g.y = Math.random() * (entry.height - g.size);
                     if (g.y < 0) g.y = 0;
                     g.element.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) rotate(${g.rotation}deg)`;
                 }
             }
           }
        };
        updateBounds(left);
        updateBounds(right);
      }
  };
  if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncLayout);
      const hud = document.querySelector('.hud-bottom');
      if (hud) ro.observe(hud);
      if (leftCol) ro.observe(leftCol);
      if (rightCol) ro.observe(rightCol);
      window.addEventListener('resize', syncLayout);
      requestAnimationFrame(syncLayout);
  } else {
      window.addEventListener('resize', syncLayout);
      requestAnimationFrame(syncLayout);
  }
  if (typeof IntersectionObserver !== 'undefined') {
      const visibilityObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
              if (entry.isIntersecting) { startRenderLoop(); } else { stopRenderLoop(); }
          }
      }, { root: null, threshold: 0 });
      visibilityObserver.observe(container);
  }
  workshopEl = container;
}

export function updateWorkshopTab() {
  if (!workshopEl) return;
  const gearsAmountEl = workshopEl.querySelector('[data-workshop="gears-amount"]');
  const gearsRateEl = workshopEl.querySelector('[data-workshop="gears-rate"]');
  const upgradeCostEl = workshopEl.querySelector('[data-workshop="upgrade-cost"]');
  const upgradeBtn = workshopEl.querySelector('[data-workshop="upgrade-gen"]');
  const rateBn = getGearsPerSecond(currentGenerationLevel);
  const cost = getGenerationUpgradeCost(currentGenerationLevel);
  if (gearsAmountEl) gearsAmountEl.innerHTML = bank.gears.fmt(bank.gears.value);
  if (gearsRateEl) gearsRateEl.innerHTML = formatNumber(rateBn);
  if (upgradeCostEl) upgradeCostEl.innerHTML = formatNumber(cost);
  if (upgradeBtn) {
    const canAfford = bank.coins.value.cmp(cost) >= 0;
    upgradeBtn.disabled = !canAfford;
    const autoLevel = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID);
    let isAutomated = false;
    if (autoLevel > 0) {
        const slot = getActiveSlot();
        const slotSuffix = slot != null ? `:${slot}` : '';
        const key = `ccc:autobuy:${AUTOMATION_AREA_KEY}:${AUTOBUY_WORKSHOP_LEVELS_ID}${slotSuffix}`;
        isAutomated = localStorage.getItem(key) !== '0';
    }
    if (isAutomated) upgradeBtn.classList.add('is-automated');
    else upgradeBtn.classList.remove('is-automated');
  }
  const currentIntLevel = Math.floor(currentGenerationLevel);
  if (currentIntLevel !== lastSyncedLevel) {
    lastSyncedLevel = currentIntLevel;
    const leftCol = workshopEl.querySelector('.workshop-side-left');
    const rightCol = workshopEl.querySelector('.workshop-side-right');
    if (leftCol) syncGearDecorations(leftCol);
    if (rightCol) syncGearDecorations(rightCol);
  }
}

function stopRenderLoop() {
  if (renderFrameId) {
    cancelAnimationFrame(renderFrameId);
    renderFrameId = null;
  }
}

let lastRenderTime = 0;
function startRenderLoop() {
  if (renderFrameId) return;
  lastRenderTime = 0;
  const loop = (timestamp) => {
    if (workshopEl && workshopEl.isConnected) {
        const gearsAmountEl = workshopEl.querySelector('[data-workshop="gears-amount"]');
        if (gearsAmountEl) {
             gearsAmountEl.innerHTML = bank.gears.fmt(bank.gears.value);
        }
        if (!lastRenderTime) lastRenderTime = timestamp;
        let dt = (timestamp - lastRenderTime) / 1000;
        lastRenderTime = timestamp;
        if (dt > 0.1) dt = 0.1; 
        for (const [container, data] of animatedGears) {
            if (!container.isConnected) continue;
            const { gears, width, height } = data;
            if (!width || !height) continue;
            for (const g of gears) {
                g.x += g.dx * dt;
                g.y += g.dy * dt;
                if (g.x < 0) { g.x = 0; g.dx = -g.dx; }
                else if (g.x + g.size > width) { g.x = width - g.size; g.dx = -g.dx; }
                if (g.y < 0) { g.y = 0; g.dy = -g.dy; }
                else if (g.y + g.size > height) { g.y = height - g.size; g.dy = -g.dy; }
                g.rotation += g.rotationSpeed * dt;
                g.element.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) rotate(${g.rotation}deg)`;
            }
        }
    }
    renderFrameId = requestAnimationFrame(loop);
  };
  renderFrameId = requestAnimationFrame(loop);
}

export function initWorkshopSystem() {
  if (initialized) return;
  initialized = true;
  currentGenerationLevel = loadGenerationLevel();
  registerTick(onTick);
  if (typeof window !== 'undefined') {
      window.addEventListener('saveSlot:change', () => {
          currentGenerationLevel = loadGenerationLevel();
          accumulatorBuffer = 0;
          if (!hasDoneInfuseReset()) { resetWorkshopState(); }
          updateWorkshopTab();
      });
      window.addEventListener('currency:change', (e) => {
          if (e.detail.key === CURRENCIES.COINS) { updateWorkshopTab(); }
      });
      window.addEventListener('currency:multiplier', (e) => {
          if (e.detail.key === CURRENCIES.GEARS) { updateWorkshopTab(); }
      });
      window.addEventListener('debug:change', () => {
          currentGenerationLevel = loadGenerationLevel();
          updateWorkshopTab();
      });
      window.addEventListener('unlock:change', (e) => {
         const detail = e.detail || {};
         if (detail.key === 'infuse') { if (!hasDoneInfuseReset()) { resetWorkshopState(); } }
      });
  }
}

export function initWorkshopTab(panelEl) {
  initWorkshopSystem();
  if (panelEl.__workshopInit) return;
  panelEl.__workshopInit = true;
  currentGenerationLevel = loadGenerationLevel();
  animatedGears.clear();
  lastSyncedLevel = -1;
  buildWorkshopUI(panelEl);
  if (typeof IntersectionObserver === 'undefined') { startRenderLoop(); }
  if (!hasDoneInfuseReset()) { resetWorkshopState(); }
  updateWorkshopTab();
}

export function getGearsProductionRate() {
  const level = loadGenerationLevel();
  return getGearsPerSecond(level);
}

export function performFreeGenerationUpgrade() {
  if (bank.coins.value.isZero()) return false;
  let coinsLog = bank.coins.value.log10;
  if (!Number.isFinite(coinsLog)) {
     if (bank.coins.value.inf) coinsLog = Infinity;
     else return false;
  }
  
  if (calculateWorkshopCostLog(currentGenerationLevel) > coinsLog) return false;
  if (calculateWorkshopCostLog(currentGenerationLevel + 1) > coinsLog) return false;

  let low = currentGenerationLevel;
  let high = 9e15; 
  if (coinsLog === Infinity) high = 9e15; 

  let best = low;
  while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (calculateWorkshopCostLog(mid) <= coinsLog) {
          best = mid;
          low = mid + 1;
      } else {
          high = mid - 1;
      }
  }
  
  let targetLevel = best + 1;

  if (targetLevel > currentGenerationLevel) {
    if (saveGenerationLevel(targetLevel)) {
      currentGenerationLevel = targetLevel;
      updateWorkshopTab();
      return true;
    }
  }
  return false;
}
