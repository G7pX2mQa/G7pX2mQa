/**
 * simulatedOffline.js
 * 
 * Antimatter Dimensions-inspired simulated tick-based offline progress.
 * Instead of calculating offline rewards via flat rate multiplication,
 * this system replays offline time as accelerated game ticks for more
 * accurate results that respect autobuyers, research leveling, and
 * passive system accumulation order.
 * 
 * Adaptive granularity: as offline duration grows, ticks represent
 * more game-time each (coarser simulation) so even year-long offline
 * periods finish in a reasonable wall-clock time.
 */

import { TICK_RATE, FIXED_STEP, pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { bank, getActiveSlot, setBankAddInterceptor } from '../util/storage.js';
import { settingsManager } from './settingsManager.js';
import { waterSystem } from './webgl/waterSystem.js'; // Water system to keep ticking visually
import { hasDoneInfuseReset } from '../ui/merchantTabs/resetTab.js';
import {
  formatTimeCompact,
  showOfflinePanel,
  grantOfflineRewards,
  calculateOfflineRewards,
  calculatePreAutomationRewards,
  RESOURCE_REGISTRY,
} from './offlinePanel.js';

// Lazy imports to avoid circular dependencies — resolved on first use
let _simulateAutomationTick = null;
let _simulateSurgeTick = null;
let _simulateLabUpdate = null;
let _simulateLabResearch = null;
let _simulateFlowTick = null;
let _simulateWorkshopTick = null;

async function ensureTickImports() {
  if (_simulateAutomationTick) return;
  const [autoMod, surgeMod, labTabMod, labNodesMod, flowMod, workshopMod] = await Promise.all([
    import('./automationEffects.js'),
    import('./surgeEffects.js'),
    import('../ui/merchantTabs/labTab.js'),
    import('./labNodes.js'),
    import('../ui/merchantTabs/flowTab.js'),
    import('../ui/merchantTabs/workshopTab.js'),
  ]);
  _simulateAutomationTick = autoMod.simulateAutomationTick;
  _simulateSurgeTick = surgeMod.simulateSurgeTick;
  _simulateLabUpdate = labTabMod.updateLabLevel;
  _simulateLabResearch = labNodesMod.tickResearch;
  _simulateFlowTick = flowMod.simulateFlowTick;
  _simulateWorkshopTick = workshopMod.simulateWorkshopTick;
}

// ---------------------------------------------------------------------------
// Adaptive Tick Granularity
// ---------------------------------------------------------------------------
// For very long offline periods, we increase the dt per simulated tick
// so the total number of iterations stays manageable.
//
const SNAPS = [
  0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000
];

function getSimTickGranularity(totalSeconds) {
  // Use a power curve so less offline time scales slightly faster.
  // Cap at 100,000 ticks maximum so that regardless of how long the user is offline,
  // it physically cannot take more than ~1-2 minutes on a normal CPU.
  let targetTicks = 1000 * Math.pow(totalSeconds, 0.38);
  targetTicks = Math.min(100000, targetTicks);
  const rawDt = totalSeconds / targetTicks;
  
  for (const snap of SNAPS) {
    if (snap >= rawDt) return snap;
  }
  
  // If it's larger than the array, keep scaling using 1,2,5 pattern
  let val = 1000000;
  while (val < rawDt) {
      if (val * 2 >= rawDt) return val * 2;
      if (val * 5 >= rawDt) return val * 5;
      val *= 10;
      if (val >= rawDt) return val;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Bank Snapshot: capture currency values before simulation to compute deltas
// ---------------------------------------------------------------------------
let simulationRewardsTracker = {};

function trackAddition(key, val) {
  try {
    const bn = BigNum.fromAny(val);
    if (bn.cmp(0) <= 0) return;
    if (!simulationRewardsTracker[key]) {
      simulationRewardsTracker[key] = BigNum.fromInt(0);
    }
    simulationRewardsTracker[key] = simulationRewardsTracker[key].add(bn);
  } catch {}
}

function startRewardTracking() {
  simulationRewardsTracker = {};
  
  // Intercept currency additions globally through storage hook
  setBankAddInterceptor(trackAddition);
  
  // Intercept XP additions
  if (window.xpSystem && typeof window.xpSystem.addXp === 'function') {
    window.xpSystem._simOriginalAddXp = window.xpSystem.addXp;
    window.xpSystem.addXp = function(val) {
      trackAddition('xp', val);
      return this._simOriginalAddXp(val);
    };
  }
  
  // Intercept MP additions
  if (window.mutationSystem && typeof window.mutationSystem.addMp === 'function') {
    window.mutationSystem._simOriginalAddMp = window.mutationSystem.addMp;
    window.mutationSystem.addMp = function(val) {
      trackAddition('mp', val);
      return this._simOriginalAddMp(val);
    };
  }
}

function stopRewardTracking() {
  setBankAddInterceptor(null);
  
  if (window.xpSystem && window.xpSystem._simOriginalAddXp) {
    window.xpSystem.addXp = window.xpSystem._simOriginalAddXp;
    delete window.xpSystem._simOriginalAddXp;
  }
  
  if (window.mutationSystem && window.mutationSystem._simOriginalAddMp) {
    window.mutationSystem.addMp = window.mutationSystem._simOriginalAddMp;
    delete window.mutationSystem._simOriginalAddMp;
  }
  
  return simulationRewardsTracker;
}

// Snapshot level-based systems
function snapshotLevels() {
  const snap = {};
  try {
    const xpState = window.xpSystem?.getXpState?.() || window.getXpState?.();
    if (xpState) snap.xpLevel = xpState.xpLevel instanceof BigNum ? xpState.xpLevel.clone() : BigNum.fromAny(xpState.xpLevel || 0);
  } catch {}
  try {
    const mState = window.mutationSystem?.getMutationState?.() || window.getMutationState?.();
    if (mState) snap.mpLevel = mState.level instanceof BigNum ? mState.level.clone() : BigNum.fromAny(mState.level || 0);
  } catch {}
  try {
    if (window.dpSystem?.getDpState) {
      const dpState = window.dpSystem.getDpState();
      if (dpState) snap.dpLevel = dpState.dpLevel instanceof BigNum ? dpState.dpLevel.clone() : BigNum.fromAny(dpState.dpLevel || 0);
    }
  } catch {}
  try {
    if (window.ppSystem?.getPpState) {
      const ppState = window.ppSystem.getPpState();
      if (ppState) snap.ppLevel = ppState.ppLevel instanceof BigNum ? ppState.ppLevel.clone() : BigNum.fromAny(ppState.ppLevel || 0);
    }
  } catch {}
  return snap;
}

function computeLevelDeltas(before) {
  const rewards = {};
  try {
    const xpState = window.xpSystem?.getXpState?.() || window.getXpState?.();
    if (xpState && before.xpLevel) {
      const afterLevel = xpState.xpLevel instanceof BigNum ? xpState.xpLevel : BigNum.fromAny(xpState.xpLevel || 0);
      const delta = afterLevel.sub(before.xpLevel);
      if (delta.cmp(BigNum.fromInt(0)) > 0) rewards.xp_levels = delta;
    }
  } catch {}
  try {
    const mState = window.mutationSystem?.getMutationState?.() || window.getMutationState?.();
    if (mState && before.mpLevel) {
      const afterLevel = mState.level instanceof BigNum ? mState.level : BigNum.fromAny(mState.level || 0);
      const delta = afterLevel.sub(before.mpLevel);
      if (delta.cmp(BigNum.fromInt(0)) > 0) rewards.mp_levels = delta;
    }
  } catch {}
  try {
    if (window.dpSystem?.getDpState && before.dpLevel) {
      const dpState = window.dpSystem.getDpState();
      const afterLevel = dpState.dpLevel instanceof BigNum ? dpState.dpLevel : BigNum.fromAny(dpState.dpLevel || 0);
      const delta = afterLevel.sub(before.dpLevel);
      if (delta.cmp(BigNum.fromInt(0)) > 0) rewards.dp_levels = delta;
    }
  } catch {}
  try {
    if (window.ppSystem?.getPpState && before.ppLevel) {
      const ppState = window.ppSystem.getPpState();
      const afterLevel = ppState.ppLevel instanceof BigNum ? ppState.ppLevel : BigNum.fromAny(ppState.ppLevel || 0);
      const delta = afterLevel.sub(before.ppLevel);
      if (delta.cmp(BigNum.fromInt(0)) > 0) rewards.pp_levels = delta;
    }
  } catch {}
  return rewards;
}

// ---------------------------------------------------------------------------
// SimulatedOfflineRunner
// ---------------------------------------------------------------------------

class SimulatedOfflineRunner {
  constructor(totalOfflineSeconds, options = {}) {
    this.totalOfflineSeconds = totalOfflineSeconds;
    this._exactRemainingSeconds = totalOfflineSeconds;
    this.speedUpSteps = 0;
    this.baseDt = getSimTickGranularity(totalOfflineSeconds);
    this.simDt = this.baseDt;
    this.totalTicks = Math.ceil(totalOfflineSeconds / this.simDt);
    this.ticksProcessed = 0;
    this.speedMultiplier = 1;
    
    // Performance tracking for ETA
    this._startTime = performance.now();
    this._activeProcessingMs = 0;
    // Default assumption: browser processes ~1500 ticks/sec at full throttle
    this._estimatedTicksPerSec = 1500; 
    
    // Tamper detection
    this.tamperDetected = false;
    this.tamperCount = 0;
    
    // State
    this.running = false;
    this.completed = false;
    this.skipped = false;
  }

  get ticksRemaining() {
    return Math.max(0, this.totalTicks - this.ticksProcessed);
  }

  get remainingSeconds() {
    return this._exactRemainingSeconds;
  }

  get percent() {
    if (this.totalTicks === 0) return 100;
    return Math.min(100, (this.ticksProcessed / this.totalTicks) * 100);
  }

  addTime(seconds) {
    this._exactRemainingSeconds += seconds;
    this.totalOfflineSeconds += seconds;
    this.recalcGranularity();
  }

  cycleSpeed() {
    this.speedUpSteps++;
    this.recalcGranularity();
  }

  recalcGranularity() {
    this.baseDt = getSimTickGranularity(this.totalOfflineSeconds);
    let dt = this.baseDt;
    
    // Jump forward in the SNAPS array for each speed up step
    for (let i = 0; i < this.speedUpSteps; i++) {
        const idx = SNAPS.indexOf(dt);
        if (idx !== -1 && idx < SNAPS.length - 1) {
            dt = SNAPS[idx + 1];
        } else {
            // Find the next logical jump in the 1-2-5 pattern
            const firstDigit = Number(dt.toString()[0]);
            if (firstDigit === 1) dt *= 2;      // 1 -> 2
            else if (firstDigit === 2) dt *= 2.5; // 2 -> 5
            else dt *= 2;                       // 5 -> 10
        }
    }
    
    this.simDt = dt;
    this.totalTicks = this.ticksProcessed + Math.ceil(this._exactRemainingSeconds / this.simDt);
  }

  /**
   * Process one batch of simulated ticks.
   * Returns true if simulation is complete.
   */
  processBatch() {
    if (this.completed || this.skipped) return true;

    // Time budget: 15ms per frame to maximize CPU usage without freezing the browser entirely.
    // This fully decouples processing speed from monitor refresh rates or FPS drops!
    const startTime = performance.now();
    let ticksThisFrame = 0;

    while (this._exactRemainingSeconds > 0) {
      const currentDt = Math.min(this.simDt, this._exactRemainingSeconds);
      
      this._simulateOneTick(currentDt);
      
      this._exactRemainingSeconds -= currentDt;
      this.ticksProcessed++;
      ticksThisFrame++;
      
      if (this.ticksProcessed >= this.totalTicks || this._exactRemainingSeconds <= 0) {
        this.completed = true;
        this._activeProcessingMs += (performance.now() - startTime);
        return true;
      }

      // Check time budget every 7 ticks to minimize performance.now() overhead
      // (Using 7 instead of 5 ensures the UI ticks counter cycles through all digits!)
      if (ticksThisFrame % 7 === 0) {
         if (performance.now() - startTime >= 15) {
            break;
         }
      }
    }

    this._activeProcessingMs += (performance.now() - startTime);
    return false;
  }

  /**
   * Simulate one tick of game time at the current granularity.
   */
  _simulateOneTick(dt) {
    try { if (_simulateAutomationTick) _simulateAutomationTick(dt); } catch (e) { console.error('SimTick automation error:', e); }
    try { if (_simulateSurgeTick) _simulateSurgeTick(dt); } catch (e) { console.error('SimTick surge error:', e); }
    try { if (_simulateLabUpdate) _simulateLabUpdate(); } catch (e) { console.error('SimTick lab-update error:', e); }
    try { if (_simulateLabResearch) _simulateLabResearch(dt); } catch (e) { console.error('SimTick lab-research error:', e); }
    try { if (_simulateFlowTick) _simulateFlowTick(dt); } catch (e) { console.error('SimTick flow error:', e); }
    try { if (_simulateWorkshopTick) _simulateWorkshopTick(dt); } catch (e) { console.error('SimTick workshop error:', e); }
  }

  /**
   * Estimate remaining wall-clock time in milliseconds based on actual hardware processing speed.
   */
  getEstimatedTimeMs() {
    if (this.completed || this.skipped) return 0;
    
    const elapsedMs = this._activeProcessingMs;
    
    // Once we have a small baseline sample (e.g. >100ms passed), we smoothly blend
    // in the actual measured ticks per second to adjust for hardware differences.
    if (elapsedMs > 100 && this.ticksProcessed > 0) {
       const currentRate = this.ticksProcessed / (elapsedMs / 1000);
       return (this.ticksRemaining / currentRate) * 1000;
    }
    
    return null;
  }
}

// ---------------------------------------------------------------------------
// UI: Simulation Overlay
// ---------------------------------------------------------------------------

function createSimulationOverlay(runner, offlineMs, onSkip, onComplete) {
  // Remove any existing offline overlay
  const existing = document.querySelector('.offline-overlay');
  if (existing) existing.remove();

  // --- Interaction Blocker (anti-cheat) ---
  const blocker = document.createElement('div');
  blocker.className = 'sim-interaction-blocker';
  blocker.setAttribute('data-sim-blocker', 'true');
  document.body.appendChild(blocker);

  // --- Main Overlay ---
  const overlay = document.createElement('div');
  overlay.className = 'offline-overlay';
  overlay.setAttribute('data-sim-overlay', 'true');

  const panel = document.createElement('div');
  panel.className = 'offline-panel sim-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'offline-header';
  header.textContent = 'Simulating Offline...';

  // Subheader
  const subHeader = document.createElement('div');
  subHeader.className = 'offline-subheader';
  subHeader.textContent = `You were gone for ${formatTimeCompact(offlineMs)}`;

  // Content area
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'offline-content-wrapper sim-content-wrapper';

  // Progress bar container
  const progressContainer = document.createElement('div');
  progressContainer.className = 'sim-progress-container';

  const progressBar = document.createElement('div');
  progressBar.className = 'sim-progress-bar';

  const tickInfo = document.createElement('div');
  tickInfo.className = 'sim-tick-info';
  tickInfo.innerHTML = `Processing tick <span class="sim-tick-current">0</span> / <span class="sim-tick-total">${formatNumber(BigNum.fromAny(runner.totalTicks))}</span>`;
  const tickCurrentSpan = tickInfo.querySelector('.sim-tick-current');
  const tickTotalSpan = tickInfo.querySelector('.sim-tick-total');

  const progressFill = document.createElement('div');
  progressFill.className = 'sim-progress-fill';
  progressFill.style.width = '0%';

  const progressText = document.createElement('div');
  progressText.className = 'sim-progress-text';
  progressText.textContent = '0%';

  progressBar.appendChild(progressFill);
  progressBar.appendChild(progressText);
  progressContainer.appendChild(tickInfo);
  progressContainer.appendChild(progressBar);

  // Info area
  const infoArea = document.createElement('div');
  infoArea.className = 'sim-info-area';

  const etaInfo = document.createElement('div');
  etaInfo.className = 'sim-eta-info';
  etaInfo.innerHTML = `Estimated time remaining: <span class="sim-eta-value">calculating...</span>`;
  const etaValueSpan = etaInfo.querySelector('.sim-eta-value');

  const speedInfo = document.createElement('div');
  speedInfo.className = 'sim-speed-info';
  speedInfo.innerHTML = `Speed: <span class="sim-speed-value">1x</span>`;
  const speedValueSpan = speedInfo.querySelector('.sim-speed-value');

  // Granularity info
  const granInfo = document.createElement('div');
  granInfo.className = 'sim-granularity-info';
  granInfo.innerHTML = `Tick granularity: <span class="sim-gran-value">...</span>`;
  const granValueSpan = granInfo.querySelector('.sim-gran-value');
  
  function updateGranInfo() {
    if (runner.simDt >= 1) {
      const secPerTick = runner.simDt;
      granValueSpan.textContent = `${formatNumber(BigNum.fromAny(secPerTick))}s per tick`;
    } else {
      const msPerTick = Math.round(runner.simDt * 1000);
      granValueSpan.textContent = `${msPerTick}ms per tick`;
    }
    
    // Update speed multiplier string
    const multiplier = runner.simDt / runner.baseDt;
    if (multiplier > 1) {
      speedValueSpan.textContent = `${multiplier === 2.5 ? '2.5' : Math.round(multiplier)}x`;
    } else {
      speedValueSpan.textContent = '1x';
    }
  }
  updateGranInfo();

  infoArea.appendChild(etaInfo);
  infoArea.appendChild(speedInfo);
  infoArea.appendChild(granInfo);

  contentWrapper.style.justifyContent = 'center';
  contentWrapper.appendChild(progressContainer);
  contentWrapper.appendChild(infoArea);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'offline-actions sim-actions';

  const speedBtn = document.createElement('button');
  speedBtn.type = 'button';
  speedBtn.className = 'sim-speed-btn';
  speedBtn.textContent = 'Speed up';
  speedBtn.addEventListener('click', () => {
    runner.cycleSpeed();
    updateGranInfo();
  });

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'sim-skip-btn';
  skipBtn.textContent = 'Skip';
  skipBtn.addEventListener('click', () => {
    runner.skipped = true;
    onSkip();
  });

  actions.appendChild(speedBtn);
  actions.appendChild(skipBtn);

  panel.appendChild(header);
  panel.appendChild(subHeader);
  panel.appendChild(contentWrapper);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // --- Anti-Cheat: MutationObserver ---
  function checkAndReinsert() {
    // Check blocker
    if (!document.body.contains(blocker) || 
        blocker.style.display === 'none' || 
        blocker.style.visibility === 'hidden' ||
        blocker.style.pointerEvents === 'none') {
      
      // Re-insert blocker
      blocker.style.display = '';
      blocker.style.visibility = '';
      blocker.style.pointerEvents = '';
      if (!document.body.contains(blocker)) {
        document.body.appendChild(blocker);
      }
    }

    // Check overlay
    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }
  }

  const tamperObserver = new MutationObserver(() => {
    if (runner.completed || runner.skipped) return;
    checkAndReinsert();
  });

  tamperObserver.observe(document.body, {
    childList: true,
    subtree: false,
    attributes: false,
  });

  // Also watch blocker for attribute changes
  const blockerAttrObserver = new MutationObserver(() => {
    if (runner.completed || runner.skipped) return;
    checkAndReinsert();
  });
  blockerAttrObserver.observe(blocker, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });

  // Update function called each animation frame
  function updateUI() {
    const pct = runner.percent;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${pct.toFixed(1)}%`;
    tickCurrentSpan.textContent = formatNumber(BigNum.fromAny(runner.ticksProcessed));
    tickTotalSpan.textContent = formatNumber(BigNum.fromAny(runner.totalTicks));
    
    const etaMs = runner.getEstimatedTimeMs();
    if (etaMs === null) {
      etaValueSpan.textContent = 'Calculating...';
    } else {
      etaValueSpan.textContent = etaMs < 1000 ? '< 1s' : formatTimeCompact(etaMs);
    }
    
    updateGranInfo();
  }

  function updateDisplayMs(newMs) {
    subHeader.textContent = `You were gone for ${formatTimeCompact(newMs)}`;
  }

  function cleanup() {
    tamperObserver.disconnect();
    blockerAttrObserver.disconnect();
    if (document.body.contains(blocker)) blocker.remove();
    if (document.body.contains(overlay)) overlay.remove();
  }

  return { overlay, blocker, updateUI, updateDisplayMs, cleanup };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

let activeSimRunner = null;
let activeUiHandle = null;
let activeDisplayMs = 0;

/**
 * Start a simulated offline progress run.
 * Called instead of the rate-based path when the setting is enabled.
 *
 * @param {number} totalOfflineMs  — total offline time in milliseconds.
 * @param {object} [options]
 * @param {boolean} [options.isWarp]  — true if triggered by Warp tab (not standard offline)
 * @param {boolean} [options.isDebug] — true if triggered by OP Time Warp debug button
 * @param {number}  [options.overrideSeconds] — override seconds (for Warp/debug; totalOfflineMs may be 0)
 */
export async function startSimulatedOffline(totalOfflineMs, options = {}) {
  const totalSeconds = options.overrideSeconds || (totalOfflineMs / 1000);
  // If the user was gone for < 5s, we only skip the check if they manually triggered a time warp, or if a simulation is already active.
  if (totalSeconds < 5 && !options.isWarp && !options.isDebug && !window.__isSimulationActive) return false;

  await ensureTickImports();

  if (activeSimRunner && activeSimRunner.running) {
    activeSimRunner.addTime(totalSeconds);
    const msToAdd = options.overrideSeconds ? options.overrideSeconds * 1000 : totalOfflineMs;
    activeDisplayMs += msToAdd;
    if (activeUiHandle) {
        activeUiHandle.updateDisplayMs(activeDisplayMs);
    }
    return true;
  }

  const isPreAutomation = !hasDoneInfuseReset();
  const runner = new SimulatedOfflineRunner(totalSeconds);
  runner.running = true;
  activeSimRunner = runner;
  window.__isSimulationActive = true;

  // Pause real game loop while simulating
  pauseGameLoop();

  // Snapshot levels for progression tracking
  const levelsBefore = snapshotLevels();

  // Start intercepting reward additions
  startRewardTracking();

  // Create UI
  const displayMs = options.overrideSeconds ? options.overrideSeconds * 1000 : totalOfflineMs;
  let uiHandle = null;

  function handleSkip() {
    window.__isSimulationActive = false;
    // Process remaining time via rate-based fallback
    const remSeconds = runner.remainingSeconds;
    if (remSeconds > 0) {
      let fallbackRewards;
      if (isPreAutomation) {
        fallbackRewards = calculatePreAutomationRewards(remSeconds);
      } else {
        fallbackRewards = calculateOfflineRewards(remSeconds);
      }
      if (fallbackRewards) {
        grantOfflineRewards(fallbackRewards);
      }
    }
    finishSimulation();
  }

  function finishSimulation() {
    window.__isSimulationActive = false;
    runner.running = false;
    if (activeSimRunner === runner) {
        activeSimRunner = null;
        activeUiHandle = null;
    }

    // Stop intercepting rewards and compute final combined deltas
    const currencyDeltas = stopRewardTracking();
    const levelDeltas = computeLevelDeltas(levelsBefore);
    const combinedRewards = { ...currencyDeltas, ...levelDeltas };

    // Cleanup UI
    if (uiHandle) uiHandle.cleanup();

    // Resume game loop
    resumeGameLoop();

    // Show standard offline panel with computed rewards
    const hasRewards = Object.keys(combinedRewards).length > 0;
    if (hasRewards) {
      showOfflinePanel(combinedRewards, displayMs, isPreAutomation);
    }
  }

  activeDisplayMs = displayMs;
  uiHandle = createSimulationOverlay(runner, displayMs, handleSkip, finishSimulation);
  activeUiHandle = uiHandle;

  // Block ESC from closing overlay during simulation
  function blockEsc(e) {
    if (runner.running && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
  window.addEventListener('keydown', blockEsc, true);

  // Animation frame processing loop
  return new Promise((resolve) => {
    function frameLoop() {
      if (!runner.running) {
        window.removeEventListener('keydown', blockEsc, true);
        resolve(true);
        return;
      }

      const done = runner.processBatch();
      uiHandle.updateUI();

      // Tick the water system visually if it's available so waves don't freeze!
      if (typeof waterSystem !== 'undefined' && waterSystem && typeof waterSystem.update === 'function') {
        waterSystem.update(0.016);
        if (typeof waterSystem.render === 'function') {
           waterSystem.render(performance.now() / 1000, 0.016);
        }
      }

      if (done) {
        finishSimulation();
        window.removeEventListener('keydown', blockEsc, true);
        resolve(true);
      } else {
        requestAnimationFrame(frameLoop);
      }
    }

    requestAnimationFrame(frameLoop);
  });
}

/**
 * Check if simulated offline mode is enabled in settings.
 */
export function isSimulatedOfflineEnabled() {
  return settingsManager.get('simulate_offline_ticks') === true;
}

// ---------------------------------------------------------------------------
// Expose remaining time for storage.js to save on tab close
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  window.getActiveSimRemainingMs = function() {
    if (activeSimRunner && activeSimRunner.running) {
      return activeSimRunner.remainingSeconds * 1000;
    }
    return 0;
  };
}
