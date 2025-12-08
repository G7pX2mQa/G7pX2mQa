
import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, CURRENCIES, getActiveSlot, watchStorageKey } from '../../util/storage.js';
import { registerTick } from '../../game/gameLoop.js';
import { openAutomationShop } from '../shopOverlayAutomation.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { hasDoneInfuseReset } from './resetTab.js';
import { bigNumFromLog10 } from '../../game/upgrades.js';
import { IS_MOBILE } from '../../main.js';

const GEAR_ICON_SRC = 'img/currencies/gear/gear.webp';
const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';

let workshopEl = null;
let initialized = false;
// We implement a custom accumulator for BigNum rates
let accumulatorBuffer = 0; // stores "fractional" parts < 1 for smooth low-rate accumulation
let currentGenerationLevel = 0;
let renderFrameId = null;

// Upgrade Constants
const GENERATION_UPGRADE_BASE_COST = BigNum.fromAny('1e12'); // 1T
const GENERATION_UPGRADE_SCALE = 10;
const LOG10_2 = 0.3010299956639812; // Math.log10(2)

export function getGenerationLevelKey(slot) {
  return `ccc:workshop:genLevel:${slot}`;
}

function loadGenerationLevel() {
  const slot = getActiveSlot();
  if (!slot) return 0;
  const raw = localStorage.getItem(getGenerationLevelKey(slot));
  // Support standard integers. 2^53 is enough levels to overflow the universe, so Number is fine for level count.
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
  
  // Verify write succeeded (checks against debug locks)
  let readBack = null;
  try {
    readBack = localStorage.getItem(key);
  } catch {}
  
  // If the read-back value matches what we wrote, the write succeeded.
  // We check loosely (String comparison) to handle potential type differences, though valStr is string.
  return readBack === valStr;
}

function getGenerationUpgradeCost(level) {
  // 1T * 10^level
  if (level === 0) return GENERATION_UPGRADE_BASE_COST;
  if (!Number.isFinite(level)) return BigNum.fromAny('Infinity');
  // 1T is 1e12. 10^level adds 'level' to exponent.
  // We can construct this directly or use mul.
  // 10^level as BigNum:
  // We can just append '0's or use power of 10 logic.
  // Since base is 1e12, result is 1e(12+level).
  // Let's rely on BigNum multiplication for safety and standard API usage, 
  // or construct via scientific notation if easy.
  // 1e12 * 10^L = 10^(12+L).
  // Since L can be large, constructing string "1e(12+L)" might be safest/fastest.
  // But let's stick to BigNum math if possible or use the existing pattern.
  // The existing pattern was: multiplier = new BigNum(1n, level). 
  // new BigNum(sig, exp) -> 1 * 10^level. This is correct and efficient.
  const multiplier = new BigNum(1n, level);
  return GENERATION_UPGRADE_BASE_COST.mulBigNumInteger(multiplier);
}

function getGearsPerSecond(level) {
  // Start at 1, double per level: 2^level
  // Use log math to construct BigNum: 10^(level * log10(2))
  if (level === 0) return BigNum.fromInt(1);
  if (!Number.isFinite(level)) return BigNum.fromAny('Infinity');
  const logValue = level * LOG10_2;
  return bigNumFromLog10(logValue);
}

function buyGenerationUpgrade() {
  const cost = getGenerationUpgradeCost(currentGenerationLevel);
  if (bank.coins.value.cmp(cost) < 0) return;

  const nextLevel = currentGenerationLevel + 1;
  if (saveGenerationLevel(nextLevel)) {
    // Only update local state and subtract coins if the save succeeded (wasn't locked)
    currentGenerationLevel = nextLevel;
    bank.coins.sub(cost);
    updateWorkshopTab();
    playPurchaseSfx();
  }
}

function onTick() {
  if (!hasDoneInfuseReset()) return;

  const rateBn = getGearsPerSecond(currentGenerationLevel);
  
  // Per tick (20tps) -> rate / 20 -> rate * 0.05
  // If rate is huge, fraction doesn't matter much.
  // If rate is small, we need to accumulate.
  
  const perTick = rateBn.mulDecimal('0.05');
  
  // If the per-tick amount is < 1, we accumulate in a float buffer (approximate).
  // If it's >= 1, we add the integer part directly and accumulate remainder.
  
  // Fast check: is perTick >= 1?
  // We can check if it has a positive exponent or is >= 1.
  
  // Simplification: Split perTick into integer and fractional parts? 
  // BigNum doesn't easily give "fractional part" as a number if it's huge.
  // But if it's huge (>= 1e18), fractional part is irrelevant.
  
  // If perTick is small (e.g. < 1e15), we might care about fractional accumulation.
  // If perTick < 1, we definitely care.
  
  // Let's try to convert perTick to a safe number. If it's Infinity (too big), we treat it as huge.
  // If it's a small BigNum, we can handle it.
  
  // Optimization:
  // 1. Get integer part.
  const whole = perTick.floorToInteger();
  const hasWhole = !whole.isZero();
  
  if (hasWhole) {
      if (bank.gears) bank.gears.add(whole);
  }
  
  // 2. Handle fractional part if rate is low enough that it matters.
  // If rate is > 1e6, fraction is negligible.
  // We only really need precise buffering for rates < 100/sec.
  
  // If currentGenerationLevel is low (< ~20), 2^20 is ~1e6.
  if (currentGenerationLevel < 20) {
      // Calculate fraction accurately?
      // perTick (BigNum) - whole (BigNum)
      // This might be expensive every tick.
      // Alternative: Just convert rateBn to Number for accumulation logic when level is low.
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
      // For high levels, fractional parts < 1 gear are irrelevant compared to the massive gains.
      accumulatorBuffer = 0;
  }
}

function resetWorkshopState() {
    if (bank.gears) bank.gears.set(0);
    // Force write 0 directly to storage (bypassing normal safe save check for reset logic usually)
    // But since this is a reset, we should respect locks? 
    // The requirement says "Workshop Level should be restricted from moving at all... if locked".
    // So if it's locked at level 50, a reset shouldn't clear it? 
    // Usually resets override locks. But 'saveGenerationLevel' uses the lock check now.
    // Let's try to save 0. If locked, it stays. 
    if (saveGenerationLevel(0)) {
        currentGenerationLevel = 0;
    }
    accumulatorBuffer = 0;
    updateWorkshopTab();
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
      <div class="workshop-info-panel">
        <div class="workshop-gears-display">
          <img src="${GEAR_ICON_SRC}" class="workshop-gears-icon" alt="Gears">
          <span data-workshop="gears-amount" class="coin-amount">0</span>
        </div>
        <div class="workshop-rate-display">
          (+<img src="${GEAR_ICON_SRC}" class="workshop-rate-icon" alt=""><span><span data-workshop="gears-rate">0</span>/sec)</span>
        </div>
        <div class="workshop-description">
		  Spend Coins to increase your Workshop Level<br>
          Each increase of your Workshop Level will double the rate of Gear production<br>
		  ${descText}<br>
          Spend Gears in the Automation Shop to unlock powerful automation upgrades
        </div>
      </div>

      <div class="workshop-doubler-panel">
        <button class="workshop-upgrade-btn" data-workshop="upgrade-gen">
          <span class="workshop-upgrade-title">Increase Workshop Level</span>
          <span class="workshop-upgrade-cost">
            Cost: <img src="${COIN_ICON_SRC}" class="workshop-upgrade-cost-icon" alt="Coins"> <span data-workshop="upgrade-cost">1T</span>
          </span>
        </button>
      </div>

      <div style="flex: 1;"></div>

      <button class="btn-automation-shop">Automation</button>
    </div>
  `;

  // Bind Events
  const upgradeBtn = container.querySelector('[data-workshop="upgrade-gen"]');
  upgradeBtn.addEventListener('click', () => {
    buyGenerationUpgrade();
  });

  const automationBtn = container.querySelector('.btn-automation-shop');
  automationBtn.addEventListener('click', () => {
    openAutomationShop();
  });

  // Init button size sync
  const syncBtnSize = () => {
      const statsBtn = document.querySelector('.hud-bottom [data-btn="stats"]');
      if (statsBtn && automationBtn) {
          const rect = statsBtn.getBoundingClientRect();
          automationBtn.style.width = `${rect.width}px`;
          automationBtn.style.height = `${rect.height}px`;
          automationBtn.style.minWidth = '0'; // Override potential min-width issues
          automationBtn.style.maxWidth = 'none';
      }
  };
  
  if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncBtnSize);
      const hud = document.querySelector('.hud-bottom');
      if (hud) ro.observe(hud);
      // Also observe window resize as fallback/supplement
      window.addEventListener('resize', syncBtnSize);
      // Initial sync
      requestAnimationFrame(syncBtnSize);
  } else {
      window.addEventListener('resize', syncBtnSize);
      requestAnimationFrame(syncBtnSize);
  }

  workshopEl = container;
}

export function updateWorkshopTab() {
  // We remove the isConnected check because this might run before the tab is attached
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
  }
}

function startRenderLoop() {
  if (renderFrameId) return;
  const loop = () => {
    if (workshopEl && workshopEl.isConnected) {
        // Only update the amount constantly, full refresh on state change
        const gearsAmountEl = workshopEl.querySelector('[data-workshop="gears-amount"]');
        if (gearsAmountEl) {
             gearsAmountEl.innerHTML = bank.gears.fmt(bank.gears.value);
        }
    }
    renderFrameId = requestAnimationFrame(loop);
  };
  renderFrameId = requestAnimationFrame(loop);
}

export function initWorkshopTab(panelEl) {
  if (panelEl.__workshopInit) return;
  panelEl.__workshopInit = true;

  currentGenerationLevel = loadGenerationLevel();
  buildWorkshopUI(panelEl);
  
  if (!initialized) {
      registerTick(onTick);
      
      // Watch for slot changes
      if (typeof window !== 'undefined') {
          window.addEventListener('saveSlot:change', () => {
              currentGenerationLevel = loadGenerationLevel();
              accumulatorBuffer = 0; // reset partial buffer
              
              // Reset if locked on load
              if (!hasDoneInfuseReset()) {
                  resetWorkshopState();
              }
              
              updateWorkshopTab();
          });
          
          // Watch for coin changes to update button state
          window.addEventListener('currency:change', (e) => {
              if (e.detail.key === CURRENCIES.COINS) {
                  updateWorkshopTab();
              }
          });

          // Watch for debug changes
          window.addEventListener('debug:change', () => {
              // Reload level in case it changed via debug panel
              const oldLevel = currentGenerationLevel;
              currentGenerationLevel = loadGenerationLevel();
              if (oldLevel !== currentGenerationLevel) {
                  updateWorkshopTab();
              }
          });

          // Watch for lock status change
          window.addEventListener('unlock:change', (e) => {
             const detail = e.detail || {};
             // 'infuse' unlock key corresponds to workshop unlock
             if (detail.key === 'infuse') {
                 if (!hasDoneInfuseReset()) {
                     resetWorkshopState();
                 }
             }
          });
      }
      
      startRenderLoop();
      initialized = true;
  }
  
  // Initial check
  if (!hasDoneInfuseReset()) {
      resetWorkshopState();
  }

  updateWorkshopTab();

}