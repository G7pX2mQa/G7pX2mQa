// js/ui/merchantTabs/workshopTab.js
import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, CURRENCIES, getActiveSlot } from '../../util/storage.js';
import { registerTick } from '../../game/gameLoop.js';
import { openShop, playPurchaseSfx } from '../shopOverlay.js';
import { hasDoneInfuseReset } from './resetTab.js';
import { bigNumFromLog10, getLevelNumber, approxLog10BigNum } from '../../game/upgrades.js';
import { IS_MOBILE } from '../../main.js';
import { AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID } from '../../game/automationUpgrades.js';

const GEAR_ICON_SRC = 'img/currencies/gear/gear.webp';
const GEAR_HUD_ICON_SRC = 'img/currencies/gear/gear_plus_base.webp';
const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';

const MAX_GEAR_DECORATIONS = 100;

let workshopEl = null;
let initialized = false;
let accumulatorBuffer = 0; 
let currentGenerationLevel = BigNum.zero();
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

// S3 Constants
const EXP_DIV_S3 = 1000;
const LOG_EXP_BASE_S3 = Math.log10(1.00001);

// S4 Constants (Explosion)
const EXPLOSION_RATE = 2.3e-10;

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

// Lazy Caches
let CACHE_S1_END_LOG = null;
let CACHE_S2_END_LOG = null;
let CACHE_S3_END_LOG = null;

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
  if (!slot) return BigNum.zero();
  const raw = localStorage.getItem(getGenerationLevelKey(slot));
  if (!raw) return BigNum.zero();
  
  try {
      // Handle both legacy "123" and new "BN:..." formats
      if (raw.startsWith('BN:') || /infinity/i.test(raw)) {
          return BigNum.fromStorage(raw);
      }
      return BigNum.fromAny(raw);
  } catch {
      return BigNum.zero();
  }
}

function saveGenerationLevel(level) {
  const slot = getActiveSlot();
  if (!slot) return false;
  const key = getGenerationLevelKey(slot);
  
  let valStr;
  if (level instanceof BigNum) {
      valStr = level.toStorage();
  } else {
      valStr = String(level);
  }
  
  try {
    localStorage.setItem(key, valStr);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('workshop:change', { detail: { slot, level } }));
    }
  } catch {}
  
  let readBack = null;
  try {
    readBack = localStorage.getItem(key);
  } catch {}
  return readBack === valStr;
}

function calculateWorkshopCostLog(level) {
    // Level is BigNum here, but for calculation we need primitive
    if (level.isInfinite()) return Infinity;
    
    // Check if level is too large for JS numbers
    // 9e15 is safe integer limit approx.
    // If level > 9e15, cost is definitely infinity given the super-exponential scaling
    if (level.cmp(9e15) > 0) return Infinity;
    
    // Convert to number for internal calc
    let lvlNum = 0;
    try {
        const str = level.toPlainIntegerString();
        lvlNum = parseFloat(str);
    } catch {
        return Infinity;
    }
    
    if (lvlNum <= 0) return GENERATION_UPGRADE_BASE_COST_LOG;

    // S1
    if (lvlNum <= L1) {
        return GENERATION_UPGRADE_BASE_COST_LOG + lvlNum * BASE_MULT_LOG;
    }
    
    if (CACHE_S1_END_LOG === null) {
        CACHE_S1_END_LOG = GENERATION_UPGRADE_BASE_COST_LOG + L1 * BASE_MULT_LOG;
    }

    // S2
    const u = lvlNum - L1;
    if (lvlNum <= L2) {
        return CACHE_S1_END_LOG + u + integralLogLin(u, K_LIN);
    }

    if (CACHE_S2_END_LOG === null) {
        const u2 = L2 - L1;
        CACHE_S2_END_LOG = CACHE_S1_END_LOG + u2 + integralLogLin(u2, K_LIN);
    }

    // S3
    const v = lvlNum - L2;
    const u_at_L = lvlNum - L1;
    const u_at_L2 = L2 - L1;
    
    // Delta S2 integral + S3 quadratic term
    const s2_continuation = v + (integralLogLin(u_at_L, K_LIN) - integralLogLin(u_at_L2, K_LIN));
    const C3 = LOG_EXP_BASE_S3 / EXP_DIV_S3;
    const s3_extra = 0.5 * C3 * v * v;
    
    if (lvlNum <= L3) {
        return CACHE_S2_END_LOG + s2_continuation + s3_extra;
    }

    if (CACHE_S3_END_LOG === null) {
        const v3 = L3 - L2;
        const u3 = L3 - L1;
        const s2_cont_3 = v3 + (integralLogLin(u3, K_LIN) - integralLogLin(u_at_L2, K_LIN));
        const s3_extra_3 = 0.5 * C3 * v3 * v3;
        CACHE_S3_END_LOG = CACHE_S2_END_LOG + s2_cont_3 + s3_extra_3;
    }
    
    // S4: Exponential Explosion
    // logCost grows exponentially with level delta
    const scalingExp = EXPLOSION_RATE * (lvlNum - L3);
    // If scalingExp > 709, Math.exp overflows to Infinity.
    if (scalingExp > 709) return Infinity; 
    
    const result = CACHE_S3_END_LOG * Math.exp(scalingExp);
    
    // Hard Cap at BigNum limit (approx 1.8e308)
    if (!Number.isFinite(result) || result > 1.79e308) return Infinity;
    
    return result;
}

export function getGenerationUpgradeCost(level) {
  let bnLevel = level;
  if (!(level instanceof BigNum)) {
      bnLevel = BigNum.fromAny(level);
  }
  
  if (bnLevel.isInfinite()) return BigNum.fromAny('Infinity');
  
  const logCost = calculateWorkshopCostLog(bnLevel);
  return bigNumFromLog10(logCost);
}

function getGearsPerSecond(level) {
  let baseRate;
  let bnLevel = level;
  if (!(level instanceof BigNum)) {
      bnLevel = BigNum.fromAny(level);
  }

  if (bnLevel.isZero()) {
    baseRate = BigNum.fromInt(1);
  } else if (bnLevel.isInfinite()) {
    baseRate = BigNum.fromAny('Infinity');
  } else {
    // If level is huge, we can use mulDecimal(LOG10_2)
    // level * 0.301... => log10(rate)
    const logValue = bnLevel.mulDecimal(LOG10_2);
    // bigNumFromLog10 expects a number if possible, or handles large numbers?
    // bigNumFromLog10 impl in upgrades.js:
    // export function bigNumFromLog10(logVal) {
    //   if (logVal === Infinity) return BigNum.fromAny('Infinity');
    //   if (logVal instanceof BigNum) { ... }
    // We can pass BigNum to bigNumFromLog10 if the helper supports it.
    // Assuming bigNumFromLog10 only takes numbers or BigNum:
    
    // Actually, bigNumFromLog10(logVal) implementation usually assumes number.
    // If logValue is BigNum (because level was BigNum), we need to handle it.
    // If level is < 1e15, we can use numbers.
    // If level is massive, rate is massive.
    
    if (bnLevel.cmp(9e15) <= 0) {
        // Safe to use standard number math
        const lvlNum = Number(bnLevel.toString());
        const logVal = lvlNum * LOG10_2;
        baseRate = bigNumFromLog10(logVal);
    } else {
        // Level is huge. 
        // rate = 2^level = 10^(level * log10(2))
        // exponent is level * 0.30103...
        // e = level * 0.30103...
        // Construct BigNum directly: 10^e
        // BigNum constructor takes { base: e }
        
        // mulDecimal returns BigNum
        const logExpBn = bnLevel.mulDecimal(LOG10_2);
        
        // If logExpBn is massive, it becomes the exponent 'e' of the new BigNum
        // We need to extract the value from BigNum logExpBn to use as exponent.
        
        // BigNum structure: sig * 10^e
        // We want 10^(logExpBn)
        // This is effectively BigNum with e = logExpBn
        
        // We can use BigNum internal structure or fromStorage logic
        // But BigNum 'e' is limited to ~1.8e308. 
        // If 'level' is ~1e308, then 'e' is ~3e307. This fits in 'e'.
        // If 'level' is larger than 1.8e308 (BigNum max), then the result is infinite.
        
        if (logExpBn.cmp(Number.MAX_VALUE) >= 0) {
            baseRate = BigNum.fromAny('Infinity');
        } else {
            // logExpBn is finite number (though represented as BigNum)
            // Extract it.
            // Since it's < Number.MAX_VALUE, we can convert to number safely?
            // Wait, MAX_VALUE is 1.79e308.
            // Number(bn) works if it fits.
            // We can try conversion.
            
            try {
                // Approximate for very large numbers
                 const logExpVal = Number(logExpBn.toScientific(10));
                 if (logExpVal === Infinity) {
                     baseRate = BigNum.fromAny('Infinity');
                 } else {
                     baseRate = bigNumFromLog10(logExpVal);
                 }
            } catch {
                baseRate = BigNum.fromAny('Infinity');
            }
        }
    }
  }
  
  const mult = bank?.gears?.mult?.get?.() ?? BigNum.fromInt(1);
  return baseRate.mulBigNumInteger(mult);
}

function buyGenerationUpgrade() {
  const cost = getGenerationUpgradeCost(currentGenerationLevel);
  if (bank.coins.value.cmp(cost) < 0) return;
  // currentGenerationLevel is BigNum
  const nextLevel = currentGenerationLevel.add(1);
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
  
  // Accumulator logic only for small levels < 20
  if (currentGenerationLevel.cmp(20) < 0) {
      // Safe to convert to number
      const lvlNum = Number(currentGenerationLevel.toPlainIntegerString());
      const rateNum = Math.pow(2, lvlNum);
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
    if (saveGenerationLevel(BigNum.zero())) {
        currentGenerationLevel = BigNum.zero();
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
  
  // Cap at 100 gears, but handle BigNum level safely
  let lvlNum = 0;
  if (currentGenerationLevel.cmp(MAX_GEAR_DECORATIONS) > 0) {
      lvlNum = MAX_GEAR_DECORATIONS;
  } else {
      lvlNum = Number(currentGenerationLevel.toPlainIntegerString());
  }

  const targetCount = Math.min(Math.floor(lvlNum), MAX_GEAR_DECORATIONS);
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
  if (upgradeCostEl) {
      let label = 'Coins';
      try {
          const isOne = !cost.isInfinite() && cost.cmp(1) === 0;
          label = isOne ? 'Coin' : 'Coins';
      } catch {}
      upgradeCostEl.innerHTML = `${formatNumber(cost)} ${label}`;
  }
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
  
  // Use toScientific for large level comparisons? or just check if it changed significantly
  // For animations, we just need to know if it grew.
  // Using toPlainIntegerString is risky if it's huge, but fine for checking floor change if we cache properly.
  // Actually, we can just use the BigNum instance itself as a key if it's immutable, but it's not.
  // We can format it to a string.
  
  let currentIntStr = '';
  if (currentGenerationLevel.isInfinite()) currentIntStr = 'Infinity';
  else currentIntStr = currentGenerationLevel.floorToInteger().toStorage(); // BN:18:sig:exp

  if (currentIntStr !== lastSyncedLevel) {
    lastSyncedLevel = currentIntStr;
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
  // If user has infinite coins and cost is infinite, or coins are simply infinite, snap to infinity immediately if cost is also seemingly infinite
  const coinsInf = bank.coins.value.isInfinite();
  const currentCost = getGenerationUpgradeCost(currentGenerationLevel);
  const costInf = currentCost.isInfinite();

  if (coinsInf && costInf && !currentGenerationLevel.isInfinite()) {
      currentGenerationLevel = BigNum.fromAny('Infinity');
      saveGenerationLevel(currentGenerationLevel);
      updateWorkshopTab();
      return true;
  }
    
  if (bank.coins.value.isZero()) return false;
  let coinsLog = approxLog10BigNum(bank.coins.value);
  if (!Number.isFinite(coinsLog)) {
     if (bank.coins.value.inf) coinsLog = Infinity;
     else return false;
  }
  
  // calculateWorkshopCostLog now expects BigNum
  if (calculateWorkshopCostLog(currentGenerationLevel) > coinsLog) return false;
  
  // We need to find the max affordable level.
  // Since level is BigNum, we have to handle potentially huge ranges.
  // But calculateWorkshopCostLog crashes if level > 1e15 or so.
  // If coinsLog is Finite, then level MUST be < 1e15 roughly.
  // So we can convert currentGenerationLevel to number for the search if it's small.
  
  if (currentGenerationLevel.cmp(9e15) > 0) return false; // Too big for normal logic, handled by Infinity check above
  
  let low = Number(currentGenerationLevel.toPlainIntegerString());
  let high = 9e15; 
  if (coinsLog === Infinity) high = 9e15; 

  let best = low;
  while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      // mid is number, need to pass BigNum to calculator
      if (calculateWorkshopCostLog(BigNum.fromInt(mid)) <= coinsLog) {
          best = mid;
          low = mid + 1;
      } else {
          high = mid - 1;
      }
  }
  
  let targetLevelVal = best + 1;
  let targetLevel = BigNum.fromInt(targetLevelVal);

  if (targetLevel.cmp(currentGenerationLevel) > 0) {
    if (saveGenerationLevel(targetLevel)) {
      currentGenerationLevel = targetLevel;
      updateWorkshopTab();
      return true;
    }
  }
  return false;
}
