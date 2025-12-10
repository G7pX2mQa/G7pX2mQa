// js/ui/merchantTabs/workshopTab.js

import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, CURRENCIES, getActiveSlot, watchStorageKey } from '../../util/storage.js';
import { registerTick } from '../../game/gameLoop.js';
import { openShop, playPurchaseSfx } from '../shopOverlay.js';
import { hasDoneInfuseReset } from './resetTab.js';
import { bigNumFromLog10 } from '../../game/upgrades.js';
import { IS_MOBILE } from '../../main.js';

const GEAR_ICON_SRC = 'img/currencies/gear/gear.webp';
const GEAR_HUD_ICON_SRC = 'img/currencies/gear/gear_plus_base.webp';
const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';

const MAX_GEAR_DECORATIONS = 100;

let workshopEl = null;
let initialized = false;
// We implement a custom accumulator for BigNum rates
let accumulatorBuffer = 0; // stores "fractional" parts < 1 for smooth low-rate accumulation
let currentGenerationLevel = 0;
let lastSyncedLevel = -1;
let renderFrameId = null;

// Upgrade Constants
const GENERATION_UPGRADE_BASE_COST = BigNum.fromAny('1e12'); // 1T
const GENERATION_UPGRADE_SCALE = 10;
const LOG10_2 = 0.3010299956639812; // Math.log10(2)

export function getGenerationLevelKey(slot) {
  return `ccc:workshop:genLevel:${slot}`;
}

// ---- Gear Animation State ----
// We'll store objects: { x, y, dx, dy, rotation, rotationSpeed, size, element, containerId }
// x, y are pixels relative to container.
// We keep a separate list per column to handle bounds checking separately if needed,
// but since bounds are container-specific, we can just store the container ref in the gear object or group them.
// Let's group by container.
const animatedGears = new Map(); // containerElement -> [{...gears}]

// Config
const GEAR_SPEED = 67; // pixels per second
const GEAR_ROTATION_SPEED_BASE = 67; // degrees per second
const GEAR_ROTATION_VARIANCE = 67; 

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
  let baseRate;
  if (level === 0) {
    baseRate = BigNum.fromInt(1);
  } else if (!Number.isFinite(level)) {
    baseRate = BigNum.fromAny('Infinity');
  } else {
    const logValue = level * LOG10_2;
    baseRate = bigNumFromLog10(logValue);
  }

  // Apply Gears Multiplier
  const mult = bank?.gears?.mult?.get?.() ?? BigNum.fromInt(1);
  return baseRate.mulBigNumInteger(mult);
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

function syncGearDecorations(container) {
  if (!container) return;

  // Ensure we have an entry
  let entry = animatedGears.get(container);
  if (!entry) {
    const rect = container.getBoundingClientRect();
    entry = {
      gears: [],
      width: rect.width,
      height: rect.height,
      needsDistribution: !rect.width || !rect.height
    };
    animatedGears.set(container, entry);
  }

  // Update bounds if valid
  const rect = container.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    entry.width = rect.width;
    entry.height = rect.height;
  }

  const targetCount = Math.min(Math.floor(currentGenerationLevel), MAX_GEAR_DECORATIONS);
  const gears = entry.gears;

  // Add gears
  while (gears.length < targetCount) {
    const img = document.createElement('img');
    img.src = GEAR_ICON_SRC;
    img.classList.add('workshop-bg-gear');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');

    // Random size
    const size = 32 + Math.random() * 48;

    // Position
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

    // Velocity & Rotation
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * GEAR_SPEED;
    const dy = Math.sin(angle) * GEAR_SPEED;
    const rotation = Math.random() * 360;
    const rotationSpeed = (Math.random() < 0.5 ? -1 : 1) * (GEAR_ROTATION_SPEED_BASE + Math.random() * GEAR_ROTATION_VARIANCE);

    img.style.width = `${size}px`;
    img.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
    img.style.willChange = 'transform';

    container.appendChild(img);

    gears.push({
      element: img,
      x, y,
      dx, dy,
      rotation,
      rotationSpeed,
      size
    });
  }

  // Remove gears
  while (gears.length > targetCount) {
    const g = gears.pop();
    if (g.element.parentNode) {
      g.element.parentNode.removeChild(g.element);
    }
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

  // Decorations will be synced in updateWorkshopTab
  const leftCol = container.querySelector('.workshop-side-left');
  const rightCol = container.querySelector('.workshop-side-right');

  // Bind Events
  const upgradeBtn = container.querySelector('[data-workshop="upgrade-gen"]');
  upgradeBtn.addEventListener('click', () => {
    buyGenerationUpgrade();
  });

  const automationBtn = container.querySelector('.btn-automation-shop');
  automationBtn.addEventListener('click', () => {
    openShop('automation');
  });

  // Init button size sync and Gear Bounds Sync
  const syncLayout = () => {
      // 1. Sync Button
      const statsBtn = document.querySelector('.hud-bottom [data-btn="stats"]');
      if (statsBtn && automationBtn) {
          const rect = statsBtn.getBoundingClientRect();
          automationBtn.style.width = `${rect.width}px`;
          automationBtn.style.height = `${rect.height}px`;
          automationBtn.style.minWidth = '0'; // Override potential min-width issues
          automationBtn.style.maxWidth = 'none';
      }
      
      // 2. Sync Gear Container Bounds
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
             
             // Check if we need to distribute gears (e.g. initial spawn was width 0)
             if (entry.needsDistribution && entry.width > 0 && entry.height > 0) {
                 entry.needsDistribution = false;
                 // Redistribute all gears
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
      
      // Also observe the side columns themselves to catch container resize
      if (leftCol) ro.observe(leftCol);
      if (rightCol) ro.observe(rightCol);
      
      // And window
      window.addEventListener('resize', syncLayout);
      requestAnimationFrame(syncLayout);
  } else {
      window.addEventListener('resize', syncLayout);
      requestAnimationFrame(syncLayout);
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

  // Update decorations only if level changed (integer part)
  const currentIntLevel = Math.floor(currentGenerationLevel);
  if (currentIntLevel !== lastSyncedLevel) {
    lastSyncedLevel = currentIntLevel;
    const leftCol = workshopEl.querySelector('.workshop-side-left');
    const rightCol = workshopEl.querySelector('.workshop-side-right');
    if (leftCol) syncGearDecorations(leftCol);
    if (rightCol) syncGearDecorations(rightCol);
  }
}

let lastRenderTime = 0;

function startRenderLoop() {
  if (renderFrameId) return;
  
  const loop = (timestamp) => {
    if (workshopEl && workshopEl.isConnected) {
        // Skip updates if hidden
        if (workshopEl.offsetParent === null) {
          renderFrameId = requestAnimationFrame(loop);
          return;
        }

        // --- 1. Update UI Text ---
        const gearsAmountEl = workshopEl.querySelector('[data-workshop="gears-amount"]');
        if (gearsAmountEl) {
             gearsAmountEl.innerHTML = bank.gears.fmt(bank.gears.value);
        }
        
        // --- 2. Update Gear Animation ---
        // Calculate dt (seconds)
        if (!lastRenderTime) lastRenderTime = timestamp;
        let dt = (timestamp - lastRenderTime) / 1000;
        lastRenderTime = timestamp;
        
        // Cap dt to prevent huge jumps if tab was backgrounded
        if (dt > 0.1) dt = 0.1; 
        
        // Iterate over all active containers
        for (const [container, data] of animatedGears) {
            if (!container.isConnected) {
                // Cleanup if detached? Or just skip.
                // If the workshop is closed/destroyed, we should probably clear this Map.
                // But workshopTab re-uses the same element or rebuilds? 
                // buildWorkshopUI clears innerHTML so old elements are gone.
                // But the container reference is new.
                // We should clean up old keys in map if not connected.
                continue;
            }
            
            const { gears, width, height } = data;
            
            // Safety check
            if (!width || !height) continue;
            
            for (const g of gears) {
                // Move
                g.x += g.dx * dt;
                g.y += g.dy * dt;
                
                // Bounce X
                if (g.x < 0) {
                    g.x = 0;
                    g.dx = -g.dx;
                } else if (g.x + g.size > width) {
                    g.x = width - g.size;
                    g.dx = -g.dx;
                }
                
                // Bounce Y
                if (g.y < 0) {
                    g.y = 0;
                    g.dy = -g.dy;
                } else if (g.y + g.size > height) {
                    g.y = height - g.size;
                    g.dy = -g.dy;
                }
                
                // Rotate
                g.rotation += g.rotationSpeed * dt;
                
                // Render
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

      // Watch for multiplier changes (debug panel)
      window.addEventListener('currency:multiplier', (e) => {
          if (e.detail.key === CURRENCIES.GEARS) {
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
}

export function initWorkshopTab(panelEl) {
  // Ensure the underlying system is initialized (e.g. tick loop)
  initWorkshopSystem();

  if (panelEl.__workshopInit) return;
  panelEl.__workshopInit = true;

  // Re-read level for UI just in case
  currentGenerationLevel = loadGenerationLevel();
  
  // Clear any stale animation data from previous inits
  animatedGears.clear();
  lastSyncedLevel = -1;
  
  buildWorkshopUI(panelEl);
  
  startRenderLoop();

  // Initial check
  if (!hasDoneInfuseReset()) {
      resetWorkshopState();
  }

  updateWorkshopTab();
}

export function getGearsProductionRate() {
  // Ensure we read the latest level from storage, as the UI module 
  // might not be initialized yet during boot-time offline checks.
  const level = loadGenerationLevel();
  return getGearsPerSecond(level);
}
