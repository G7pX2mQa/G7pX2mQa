
import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, CURRENCIES, getActiveSlot, watchStorageKey } from '../../util/storage.js';
import { registerTick, RateAccumulator } from '../../game/gameLoop.js';
import { openAutomationShop } from '../shopOverlayAutomation.js';
import { hasDoneInfuseReset } from './resetTab.js';

const GEAR_ICON_SRC = 'img/currencies/gear/gear.webp';
const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';

let workshopEl = null;
let initialized = false;
let rateAccumulator = null;
let currentGenerationLevel = 0;
let renderFrameId = null;

// Upgrade Constants
const GENERATION_UPGRADE_BASE_COST = BigNum.fromAny('1e12'); // 1T
const GENERATION_UPGRADE_SCALE = 10;

export function getGenerationLevelKey(slot) {
  return `ccc:workshop:genLevel:${slot}`;
}

function loadGenerationLevel() {
  const slot = getActiveSlot();
  if (!slot) return 0;
  const raw = localStorage.getItem(getGenerationLevelKey(slot));
  return parseInt(raw || '0', 10);
}

function saveGenerationLevel(level) {
  const slot = getActiveSlot();
  if (!slot) return;
  localStorage.setItem(getGenerationLevelKey(slot), String(level));
  currentGenerationLevel = level;
}

function getGenerationUpgradeCost(level) {
  // 1T * 10^level
  if (level === 0) return GENERATION_UPGRADE_BASE_COST;
  const multiplier = new BigNum(1n, level);
  return GENERATION_UPGRADE_BASE_COST.mulBigNumInteger(multiplier);
}

function getGearsPerSecond(level) {
  // Start at 1, double per level
  // 1 * 2^level
  return Math.pow(2, level);
}

function buyGenerationUpgrade() {
  const cost = getGenerationUpgradeCost(currentGenerationLevel);
  if (bank.coins.value.cmp(cost) < 0) return;

  bank.coins.sub(cost);
  saveGenerationLevel(currentGenerationLevel + 1);
  updateWorkshopTab();
}

function onTick() {
  if (!hasDoneInfuseReset()) return;

  if (!rateAccumulator) {
    rateAccumulator = new RateAccumulator(CURRENCIES.GEARS, bank);
  }
  const rate = getGearsPerSecond(currentGenerationLevel);
  rateAccumulator.addRate(rate);
}

function resetWorkshopState() {
    if (bank.gears) bank.gears.set(0);
    saveGenerationLevel(0);
    if (rateAccumulator) rateAccumulator.buffer = 0;
    updateWorkshopTab();
}

function buildWorkshopUI(container) {
  container.innerHTML = `
    <div class="merchant-workshop">
      <div class="workshop-info-panel">
        <div class="workshop-gears-display">
          <img src="${GEAR_ICON_SRC}" class="workshop-gears-icon" alt="Gears">
          <span data-workshop="gears-amount" class="coin-amount">0</span>
        </div>
        <div class="workshop-rate-display">
          (+<img src="${GEAR_ICON_SRC}" class="workshop-rate-icon" alt=""><span data-workshop="gears-rate">0</span>/sec)
        </div>
        <div class="workshop-description">
		  The Workshop allows you to passively generate Gears<br>
          Each increase of your Workshop Level will double the rate of Gear production<br>
		  Click on the big red button below to open the Automation Shop<br>
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

  const rate = getGearsPerSecond(currentGenerationLevel);
  const cost = getGenerationUpgradeCost(currentGenerationLevel);

  // Wrap rate in BigNum so formatNumber uses suffix formatting instead of raw string
  const rateBn = BigNum.fromAny(rate);

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
              if (rateAccumulator) rateAccumulator.buffer = 0; // reset partial buffer
              
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
