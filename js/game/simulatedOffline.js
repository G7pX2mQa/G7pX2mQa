/**
 * js/game/simulatedOffline.js
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

import { TICK_RATE, FIXED_STEP, pauseGameLoop, resumeGameLoop, triggerUiFrameListeners } from './gameLoop.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { bank, getActiveSlot, setBankAddInterceptor } from '../util/storage.js';
import { setHtmlOrText } from '../util/uiHelpers.js';
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
  captureTotals,
  applyAutoColor,
  getCurrentVal,
} from './offlinePanel.js';
import { ensureCustomScrollbar } from '../ui/shopOverlay.js';

// Lazy imports to avoid circular dependencies — resolved on first use
let _simulateAutomationTick = null;
let _simulateSurgeTick = null;
let _simulateLabUpdate = null;
let _simulateLabResearch = null;
let _simulateFlowTick = null;
let _simulateWorkshopTick = null;
let _RESEARCH_NODES = null;
let _WATERWHEEL_DEFS = null;
let _isResearchNodeActive = null;

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
  _RESEARCH_NODES = labNodesMod.RESEARCH_NODES;
  _isResearchNodeActive = labNodesMod.isResearchNodeActive;
  _simulateFlowTick = flowMod.simulateFlowTick;
  _WATERWHEEL_DEFS = flowMod.WATERWHEEL_DEFS;
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
let simulationLevelTracker = {};
let _levelGainHandlers = {};

function trackLevelGained(key, amt) {
    if (!amt) return;
    const bn = BigNum.fromAny(amt);
    if (bn.cmp(0) <= 0) return;
    const fullKey = `${key}_levels`;
    if (!simulationLevelTracker[fullKey]) {
        simulationLevelTracker[fullKey] = BigNum.fromInt(0);
    }
    simulationLevelTracker[fullKey] = simulationLevelTracker[fullKey].add(bn);
}

function startRewardTracking() {
  simulationRewardsTracker = {};
  simulationLevelTracker = {};
  
  _levelGainHandlers = {};
  
  RESOURCE_REGISTRY.forEach(config => {
      if (config.type === 'levelProg' && config.simEventName) {
          const handler = (e) => {
              const ext = config.simEventExtract ? config.simEventExtract(e) : {};
              trackLevelGained(config.key, ext.levels);
              if (ext.progress) {
                  if (!simulationRewardsTracker[config.key]) simulationRewardsTracker[config.key] = BigNum.fromInt(0);
                  simulationRewardsTracker[config.key] = simulationRewardsTracker[config.key].add(BigNum.fromAny(ext.progress));
              }
          };
          _levelGainHandlers[config.key] = { eventName: config.simEventName, handler };
          window.addEventListener(config.simEventName, handler);
      }
  });

  const _wwGainHandler = (e) => {
      const id = e.detail?.id;
      const levels = e.detail?.levelsGained;
      if (id && levels) {
          if (!simulationLevelTracker.waterwheel_levels) simulationLevelTracker.waterwheel_levels = {};
          if (!simulationLevelTracker.waterwheel_levels[id]) simulationLevelTracker.waterwheel_levels[id] = BigNum.fromInt(0);
          simulationLevelTracker.waterwheel_levels[id] = simulationLevelTracker.waterwheel_levels[id].add(levels);
      }
  };
  _levelGainHandlers['waterwheel_levels'] = { eventName: 'waterwheel:change', handler: _wwGainHandler };
  window.addEventListener('waterwheel:change', _wwGainHandler);

  setBankAddInterceptor((key, amt) => {
    if (!simulationRewardsTracker[key]) {
      simulationRewardsTracker[key] = BigNum.fromInt(0);
    }
    simulationRewardsTracker[key] = simulationRewardsTracker[key].add(amt);
  });
}

function stopRewardTracking() {
  setBankAddInterceptor(null);
  for (const key in _levelGainHandlers) {
      const { eventName, handler } = _levelGainHandlers[key];
      window.removeEventListener(eventName, handler);
  }
  
  // Format waterwheels as array for UI
  if (simulationLevelTracker.waterwheel_levels && _WATERWHEEL_DEFS) {
      const wwArr = [];
      for (const id in simulationLevelTracker.waterwheel_levels) {
          wwArr.push({
              id: id,
              name: _WATERWHEEL_DEFS[id]?.name,
              levels: simulationLevelTracker.waterwheel_levels[id]
          });
      }
      simulationLevelTracker.waterwheel_levels = wwArr;
  }
  
  return { ...simulationRewardsTracker, ...simulationLevelTracker };
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

function computeLevelDeltas(beforeTotals, afterTotals) {
  const rewards = {};
  
  if (beforeTotals?.research_levels && afterTotals?.research_levels && _RESEARCH_NODES) {
      const researchArr = [];
      for (const id in afterTotals.research_levels) {
          const beforeLvl = beforeTotals.research_levels[id] || 0;
          const afterLvl = afterTotals.research_levels[id] || 0;
          const afterBn = BigNum.fromAny(afterLvl);
          const beforeBn = BigNum.fromAny(beforeLvl);
          if (afterBn.isInfinite() || afterBn.cmp(beforeBn) > 0) {
              const node = _RESEARCH_NODES.find(n => n.id == id);
              if (node) {
                  researchArr.push({
                      id: id,
                      name: node.title,
                      levels: (afterBn.isInfinite() ? afterBn : afterBn.sub(beforeBn))
                  });
              }
          }
      }
      if (researchArr.length > 0) rewards.research_levels = researchArr;
  }

  // Waterwheel deltas are natively captured inside simulationLevelTracker.waterwheel_levels by the event hook!
  // No precision loss occurs because it accumulates exactly how many levels were gained.
  
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

function _makeLiveRow(config, key, id, name) {
  const row = document.createElement('div');
  row.className = 'offline-row';
  row.style.display = 'none';

  const plus = document.createElement('span');
  plus.className = 'offline-plus';
  plus.textContent = '+';

  const icon = document.createElement('img');
  icon.className = 'offline-icon';
  let iconSrc = config.icon;
  if (key === 'waterwheel_levels' && _WATERWHEEL_DEFS && _WATERWHEEL_DEFS[id]) {
    iconSrc = _WATERWHEEL_DEFS[id].image;
  }
  icon.src = iconSrc;
  icon.alt = config.singular;

  const text = document.createElement('span');
  text.className = 'offline-text';

  const infSpan = document.createElement('span');
  infSpan.className = 'infinity-symbol';
  infSpan.innerHTML = '&infin;';
  infSpan.style.color = '#ffff55';
  infSpan.style.webkitTextFillColor = '#ffff55';
  infSpan.style.display = 'none';

  if (key === 'research_levels') {
    plus.style.color = '#004F96';
    text.style.color = '#004F96';
  } else {
    let styleKey = key;
    if (key === 'waterwheel_levels' && _WATERWHEEL_DEFS && _WATERWHEEL_DEFS[id]) {
      styleKey = _WATERWHEEL_DEFS[id].styleKey || 'coins';
    }
    const matchedConfig = RESOURCE_REGISTRY.find(r => r.key === styleKey);
    applyAutoColor(plus, text, styleKey, matchedConfig);
  }

  row.appendChild(plus);
  row.appendChild(icon);
  row.appendChild(infSpan);
  row.appendChild(text);

  return {
    row, textEl: text, infSpan, config, key, id, name,
    isResearch: key === 'research_levels',
    isWaterwheel: key === 'waterwheel_levels',
  };
}

function createSimulationOverlay(runner, offlineMs, onSkip, onComplete, beforeTotals, oldTotals) {
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
  header.textContent = 'Simulating Offline Progress...';

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
    let granStr = '';
    if (runner.simDt >= 1) {
      granStr = `${formatNumber(BigNum.fromAny(runner.simDt))}s per tick`;
    } else {
      granStr = `${Math.round(runner.simDt * 1000)}ms per tick`;
    }
    setHtmlOrText(granValueSpan, granStr);
    
    // Update speed multiplier string
    const multiplier = runner.simDt / runner.baseDt;
    let speedStr = '1x';
    if (multiplier > 1) {
      speedStr = `${multiplier === 2.5 ? '2.5' : Math.round(multiplier)}x`;
    }
    setHtmlOrText(speedValueSpan, speedStr);
  }
  updateGranInfo();

  infoArea.appendChild(etaInfo);
  infoArea.appendChild(speedInfo);
  infoArea.appendChild(granInfo);

  contentWrapper.style.justifyContent = 'center';
  contentWrapper.appendChild(progressContainer);
  contentWrapper.appendChild(infoArea);

  // ── Rewards View (Swap View) ───────────────────────────────────
  const rewardsWrapper = document.createElement('div');
  rewardsWrapper.className = 'offline-content-wrapper';
  rewardsWrapper.style.display = 'none';

  const rewardsScroll = document.createElement('div');
  rewardsScroll.className = 'offline-scroll-container sim-rewards-scroll';

  const rewardsList = document.createElement('div');
  rewardsList.className = 'offline-list';

  const liveRowInfos = [];
  const visibleRowSet = new Set();

  for (const config of RESOURCE_REGISTRY) {
    const key = config.key;
    if (key === 'research_levels' && _RESEARCH_NODES) {
      for (const node of _RESEARCH_NODES) {
        if (_isResearchNodeActive && !_isResearchNodeActive(node.id)) continue;
        const info = _makeLiveRow(config, key, node.id, node.title);
        liveRowInfos.push(info);
        rewardsList.appendChild(info.row);
      }
      continue;
    }
    if (key === 'waterwheel_levels' && _WATERWHEEL_DEFS) {
      for (const id of Object.keys(_WATERWHEEL_DEFS)) {
        const def = _WATERWHEEL_DEFS[id];
        const info = _makeLiveRow(config, key, id, def.name);
        liveRowInfos.push(info);
        rewardsList.appendChild(info.row);
      }
      continue;
    }
    const info = _makeLiveRow(config, key, null, null);
    liveRowInfos.push(info);
    rewardsList.appendChild(info.row);
  }

  rewardsScroll.appendChild(rewardsList);

  const stickyTick = document.createElement('div');
  stickyTick.className = 'sim-tick-sticky';
  stickyTick.innerHTML = `Processing tick <span class="sim-tick-current-live">0</span> / <span class="sim-tick-total-live">${formatNumber(BigNum.fromAny(runner.totalTicks))}</span>`;
  const stickyTickCurrent = stickyTick.querySelector('.sim-tick-current-live');
  const stickyTickTotal = stickyTick.querySelector('.sim-tick-total-live');

  rewardsWrapper.appendChild(rewardsScroll);
  rewardsWrapper.appendChild(stickyTick);

  // IntersectionObserver: only update text for rows in viewport
  let rowObserver = null;
  if (typeof IntersectionObserver !== 'undefined') {
    rowObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleRowSet.add(entry.target);
        else visibleRowSet.delete(entry.target);
      }
    }, { root: rewardsScroll, threshold: 0 });
    for (const info of liveRowInfos) rowObserver.observe(info.row);
  }

  let isRewardsView = false;
  let rewardsScrollbarInit = false;

  function updateRewardsRows() {
    for (const info of liveRowInfos) {
      let val = null;
      if (info.isResearch) {
        const cur = getCurrentVal('research_levels', info.id);
        const before = beforeTotals?.research_levels?.[info.id] || 0;
        const curNum = typeof cur === 'number' ? cur : Number(String(cur));
        const beforeNum = typeof before === 'number' ? before : Number(String(before));
        const delta = curNum - beforeNum;
        if (delta > 0) val = BigNum.fromAny(delta);
      } else if (info.isWaterwheel) {
        val = simulationLevelTracker.waterwheel_levels?.[info.id] || null;
      } else if (info.config.type === 'levelStat') {
        val = simulationLevelTracker[info.key] || null;
      } else {
        val = simulationRewardsTracker[info.key] || null;
      }

      let shouldShow = false;
      if (val) {
        if (typeof val.isZero === 'function' && val.isZero()) {
          shouldShow = false;
        } else if (val instanceof BigNum) {
          shouldShow = val.isInfinite() || val.cmp(BigNum.fromInt(1)) >= 0;
        } else {
          shouldShow = Number(val) >= 1;
        }
      }
      info.row.style.display = shouldShow ? '' : 'none';
      if (!shouldShow) continue;
      if (rowObserver && !visibleRowSet.has(info.row)) continue;

      if (info.isResearch || info.isWaterwheel) {
        const levelCount = BigNum.fromAny(val);
        const label = !levelCount.isInfinite() && levelCount.cmp(BigNum.fromInt(1)) === 0 ? 'Level' : 'Levels';
        let diffText = '';
        if (settingsManager.get('show_offline_diff') && oldTotals && oldTotals[info.key]) {
          const newAmt = getCurrentVal(info.key, info.id);
          const oldAmt = oldTotals[info.key]?.[info.id];
          if (newAmt !== undefined && oldAmt !== undefined) {
            let oldStr = formatNumber(oldAmt);
            let newStr = formatNumber(newAmt);
            if (oldStr === 'Infinity' || oldStr === 'NaN') oldStr = '\u221e';
            if (newStr === 'Infinity' || newStr === 'NaN') newStr = '\u221e';
            diffText = ` <span style="font-size: 0.85em;">(${oldStr} &rarr; ${newStr})</span>`;
          }
        }
        setHtmlOrText(info.textEl, `${formatNumber(levelCount)} ${label} of ${info.name}${diffText}`);
        info.infSpan.style.display = 'none';
      } else {
        let isOne = false;
        if (val instanceof BigNum) {
          isOne = !val.isInfinite() && val.cmp(BigNum.fromInt(1)) === 0;
        } else {
          isOne = Number(val) === 1;
        }
        const displayName = isOne ? info.config.singular : info.config.plural;
        let amountText = formatNumber(val);
        const hasInfinity = amountText === 'Infinity' || amountText === 'NaN' || amountText.includes('infinity-symbol');
        let diffText = '';
        if (settingsManager.get('show_offline_diff') && oldTotals && oldTotals[info.key] !== undefined) {
          const newAmt = getCurrentVal(info.key);
          const oldAmt = oldTotals[info.key];
          if (newAmt !== undefined && oldAmt !== undefined) {
            let oldStr = formatNumber(oldAmt);
            let newStr = formatNumber(newAmt);
            if (oldStr === 'Infinity' || oldStr === 'NaN') oldStr = '\u221e';
            if (newStr === 'Infinity' || newStr === 'NaN') newStr = '\u221e';
            diffText = ` <span style="font-size: 0.85em;">(${oldStr} &rarr; ${newStr})</span>`;
          }
        }
        if (hasInfinity) {
          info.infSpan.style.display = '';
          info.textEl.innerHTML = displayName;
        } else {
          info.infSpan.style.display = 'none';
          setHtmlOrText(info.textEl, `${amountText} ${displayName}${diffText}`);
        }
      }
    }
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'offline-actions sim-actions';

  const speedBtn = document.createElement('button');
  speedBtn.type = 'button';
  speedBtn.className = 'sim-speed-btn';
  speedBtn.textContent = 'Speed Up';
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

  const swapBtn = document.createElement('button');
  swapBtn.type = 'button';
  swapBtn.className = 'sim-swap-btn';
  swapBtn.textContent = 'Swap View';
  swapBtn.addEventListener('click', () => {
    isRewardsView = !isRewardsView;
    contentWrapper.style.display = isRewardsView ? 'none' : '';
    rewardsWrapper.style.display = isRewardsView ? '' : 'none';
    if (isRewardsView && !rewardsScrollbarInit) {
      rewardsScrollbarInit = true;
      requestAnimationFrame(() => {
        ensureCustomScrollbar(panel, rewardsWrapper, '.sim-rewards-scroll');
      });
    }
  });

  actions.appendChild(speedBtn);
  actions.appendChild(skipBtn);
  actions.appendChild(swapBtn);

  panel.appendChild(header);
  panel.appendChild(subHeader);
  panel.appendChild(contentWrapper);
  panel.appendChild(rewardsWrapper);
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
    const pctStr = `${pct}%`;
    if (progressFill.style.width !== pctStr) {
      progressFill.style.width = pctStr;
    }
    setHtmlOrText(progressText, `${pct.toFixed(1)}%`);
    setHtmlOrText(tickCurrentSpan, formatNumber(BigNum.fromAny(runner.ticksProcessed)));
    setHtmlOrText(tickTotalSpan, formatNumber(BigNum.fromAny(runner.totalTicks)));
    
    const etaMs = runner.getEstimatedTimeMs();
    let etaStr = 'Calculating...';
    if (etaMs !== null) {
      etaStr = etaMs < 1000 ? '< 1s' : formatTimeCompact(etaMs);
    }
    setHtmlOrText(etaValueSpan, etaStr);
    
    updateGranInfo();

    // Sticky tick info (always updated)
    setHtmlOrText(stickyTickCurrent, formatNumber(BigNum.fromAny(runner.ticksProcessed)));
    setHtmlOrText(stickyTickTotal, formatNumber(BigNum.fromAny(runner.totalTicks)));

    // Update live rewards rows when rewards view is active
    if (isRewardsView) {
      updateRewardsRows();
    }
  }

  function updateDisplayMs(newMs) {
    subHeader.textContent = `You were gone for ${formatTimeCompact(newMs)}`;
  }

  function cleanup() {
    tamperObserver.disconnect();
    blockerAttrObserver.disconnect();
    if (rowObserver) rowObserver.disconnect();
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
  const beforeTotals = captureTotals();

  let oldTotals = null;
  if (settingsManager.get('show_offline_diff')) {
    oldTotals = beforeTotals;
  }

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
    const afterTotals = captureTotals();
    const levelDeltas = computeLevelDeltas(beforeTotals, afterTotals);
    const combinedRewards = { ...currencyDeltas, ...levelDeltas };

    // Cleanup UI
    if (uiHandle) uiHandle.cleanup();

    // Resume game loop
    resumeGameLoop();

    // Show standard offline panel with computed rewards
    const hasRewards = Object.keys(combinedRewards).length > 0;
    if (hasRewards) {
      showOfflinePanel(combinedRewards, displayMs, isPreAutomation, oldTotals);
    }
  }

  activeDisplayMs = displayMs;
  uiHandle = createSimulationOverlay(runner, displayMs, handleSkip, finishSimulation, beforeTotals, oldTotals);
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
    let lastFrameTime = performance.now();
    
    function frameLoop() {
      if (!runner.running) {
        window.removeEventListener('keydown', blockEsc, true);
        resolve(true);
        return;
      }

      const now = performance.now();
      let dt = (now - lastFrameTime) / 1000;
      // Cap at 0.1s to prevent huge jumps if the thread stutters
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) dt = 0.016;
      lastFrameTime = now;

      const done = runner.processBatch();
      uiHandle.updateUI();

      // Tick the water system visually if it's available so waves don't freeze!
      // But only if we are actually viewing the playfield (e.g. no playfield-view-blocking overlays are open).
      const isAnyOverlayOpen = document.querySelector('.merchant-overlay.is-open') !== null || document.querySelector('.map-overlay.is-open') !== null;
      if (!isAnyOverlayOpen) {
          if (typeof waterSystem !== 'undefined' && waterSystem && typeof waterSystem.update === 'function') {
            waterSystem.update(dt);
            if (typeof waterSystem.render === 'function') {
               waterSystem.render(now / 1000, dt);
            }
          }
      }

      // Tick active UI frames (like Flow and Sell tabs)
      if (typeof triggerUiFrameListeners === 'function') {
          triggerUiFrameListeners(now / 1000, dt);
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
  return settingsManager.get('simulate_offline_ticks') === true && hasDoneInfuseReset();
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
