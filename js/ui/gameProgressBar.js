import { isForgeUnlocked, isInfuseUnlocked, isSurgeUnlocked, getCurrentSurgeLevel } from "./merchantTabs/resetTab.js";
import { getActiveSlot } from '../util/storage.js';
import { getXpState } from '../game/xpSystem.js';
import { levelBigNumToNumber } from '../game/upgrades.js';
import { registerFrame } from '../game/gameLoop.js';
import { settingsManager } from '../game/settingsManager.js';
import { showNotification } from '../ui/notifications.js';
import { getResearchNodeLevel, RESEARCH_NODES } from '../game/labNodes.js';

const GOAL_MODE = {
  NORMAL: 'normal',
  LOGARITHMIC: 'logarithmic'
};

const GOALS = [
  {
    id: 1,
    text: 'Collect 10 Coins',
    icon: 'img/currencies/coin/coin.webp',
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 10,
    getCurrent: () => {
      const slot = getActiveSlot();
      const progressRaw = localStorage.getItem(`ccc:unlock:shop:progress:${slot}`);
      return parseInt(progressRaw || '0', 10);
    },
    isComplete: () => {
      const slot = getActiveSlot();
      return localStorage.getItem(`ccc:unlock:shop:${slot}`) === '1';
    }
  },
  {
    id: 2,
    text: 'Unlock the XP system, then reach XP Level 31 and unlock a certain upgrade',
    icon: 'img/misc/forge.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 31,
    getCurrent: () => {
      const xpState = getXpState();
      if (!xpState || !xpState.unlocked) return 0;
      return levelBigNumToNumber(xpState.xpLevel);
    },
    isComplete: () => {
      const xpState = getXpState();
      if (!xpState || !xpState.unlocked) return false;
      return levelBigNumToNumber(xpState.xpLevel) >= 31 && isForgeUnlocked();
    }
  },
  {
    id: 3,
    text: 'Reach XP Level 101 and unlock a certain upgrade',
    icon: 'img/misc/infuse.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 101,
    getCurrent: () => {
      const xpState = getXpState();
      if (!xpState || !xpState.unlocked) return 0;
      return levelBigNumToNumber(xpState.xpLevel);
    },
    isComplete: () => {
      const xpState = getXpState();
      if (!xpState || !xpState.unlocked) return false;
      return levelBigNumToNumber(xpState.xpLevel) >= 101 && isInfuseUnlocked();
    }
  },
  {
    id: 4,
    text: 'Reach XP Level 201 and unlock a certain upgrade',
    icon: 'img/misc/surge.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 201,
    getCurrent: () => {
      const xpState = getXpState();
      if (!xpState || !xpState.unlocked) return 0;
      return levelBigNumToNumber(xpState.xpLevel);
    },
    isComplete: () => {
      const xpState = getXpState();
      if (!xpState || !xpState.unlocked) return false;
      return levelBigNumToNumber(xpState.xpLevel) >= 201 && isSurgeUnlocked();
    }
  },
  {
    id: 5,
    text: 'Reach Surge Milestone 8',
    icon: 'img/stats/rp/rp.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 8,
    getCurrent: () => {
      let level = getCurrentSurgeLevel();
      if (typeof level === 'bigint') return Number(level);
      if (typeof level === 'number') return level;
      if (level === Infinity || level === 'Infinity') return 8; // If they have infinite surge level, cap to 8
      return 0;
    },
    isComplete: () => {
      let level = getCurrentSurgeLevel();
      if (level === Infinity || level === 'Infinity') return true;
      if (typeof level === 'bigint') return level >= 8n;
      if (typeof level === 'number') return level >= 8;
      return false;
    }
  },
  {
    id: 6,
    text: 'Research Lab Node 4',
    icon: 'img/misc/experiment.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 4,
    getCurrent: () => {
      const node4 = RESEARCH_NODES.find(n => n.id === 4);
      if (node4 && getResearchNodeLevel(4) >= node4.maxLevel) {
          return 4;
      }

      let maxedCount = 0;
      const relevantNodes = [1, 2, 3, 4];
      for (const nodeId of relevantNodes) {
          const node = RESEARCH_NODES.find(n => n.id === nodeId);
          if (node) {
              const level = getResearchNodeLevel(node.id);
              if (level >= node.maxLevel) {
                  maxedCount++;
              }
          }
      }
      return maxedCount;
    },
    isComplete: () => {
      const node4 = RESEARCH_NODES.find(n => n.id === 4);
      if (node4 && getResearchNodeLevel(4) >= node4.maxLevel) {
          return true;
      }

      let maxedCount = 0;
      const relevantNodes = [1, 2, 3, 4];
      for (const nodeId of relevantNodes) {
          const node = RESEARCH_NODES.find(n => n.id === nodeId);
          if (node) {
              const level = getResearchNodeLevel(node.id);
              if (level >= node.maxLevel) {
                  maxedCount++;
              }
          }
      }
      return maxedCount >= 4;
    }
  },
  {
    id: 7,
    text: 'Reach Surge Milestone 20',
    icon: 'img/stats/fp/fp.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 20,
    getCurrent: () => {
      let level = getCurrentSurgeLevel();
      if (typeof level === 'bigint') return Number(level);
      if (typeof level === 'number') return level;
      if (level === Infinity || level === 'Infinity') return 20;
      return 0;
    },
    isComplete: () => {
      let level = getCurrentSurgeLevel();
      if (level === Infinity || level === 'Infinity') return true;
      if (typeof level === 'bigint') return level >= 20n;
      if (typeof level === 'number') return level >= 20;
      return false;
    }
  },
  {
    id: 8,
    text: 'Reach Surge Milestone 125',
    icon: 'img/currencies/scrap/scrap.webp',
    unlocksHelpText: true,
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 125,
    getCurrent: () => {
      let level = getCurrentSurgeLevel();
      if (typeof level === 'bigint') return Number(level);
      if (typeof level === 'number') return level;
      if (level === Infinity || level === 'Infinity') return 125;
      return 0;
    },
    isComplete: () => {
      let level = getCurrentSurgeLevel();
      if (level === Infinity || level === 'Infinity') return true;
      if (typeof level === 'bigint') return level >= 125n;
      if (typeof level === 'number') return level >= 125;
      return false;
    }
  },
  {
    id: 9,
    text: 'Collect 10 Materials',
    icon: 'img/materials/stone.webp',
    mode: GOAL_MODE.NORMAL,
    start: 0,
    target: 10,
    getCurrent: () => {
      const slot = getActiveSlot();
      const progressRaw = localStorage.getItem(`ccc:unlock:shop:uc:progress:${slot}`);
      return parseInt(progressRaw || '0', 10);
    },
    isComplete: () => {
      const slot = getActiveSlot();
      return localStorage.getItem(`ccc:unlock:shop:uc:${slot}`) === '1';
    }
  }
];

export function showDelayedGoalNotifications() {
  if (typeof window === 'undefined') return;
  if (window.__delayedGoalNotifications && window.__delayedGoalNotifications.length > 0) {
      for (const notif of window.__delayedGoalNotifications) {
          showNotification(notif.text, notif.icon);
          localStorage.setItem(notif.notifKey, '1');
      }
      window.__delayedGoalNotifications = [];
  }
}

let initialized = false;

export function initGameProgressBar() {
  if (initialized) return;
  initialized = true;

  registerFrame(updateGameProgressBar);
}

export function updateGameProgressBar() {
  const wrapper = document.getElementById('hud-bottom-wrapper');
  const bar = document.getElementById('goal-progress-bar');
  const fill = document.getElementById('goal-bar-fill');
  const textEl = document.getElementById('goal-bar-text');

  if (!wrapper || !bar || !fill || !textEl) return;


  let activeGoal = null;
  let allComplete = true;

  const slot = getActiveSlot();

  for (const goal of GOALS) {
    const compKey = `ccc:goal:completed:${goal.id}:${slot}`;
    const notifKey = `ccc:goal:notified:${goal.id}:${slot}`;
    
    let isComp = localStorage.getItem(compKey) === '1' || localStorage.getItem(notifKey) === '1';
    if (!isComp && goal.isComplete()) {
      isComp = true;
      localStorage.setItem(compKey, '1');
    }

    if (isComp) {
      if (!localStorage.getItem(notifKey)) {
        let notifText = 'Goal complete!';
        if (goal.unlocksHelpText) {
          notifText += '<br><span class="notification-subtext">New help text unlocked</span>';
        }

        const shouldDelayForTsunami = goal.id !== 8 && window.__tsunamiActive;
        const shouldDelayForMap = goal.id === 8 && window.__mapSequenceActive;

        if (typeof window !== 'undefined' && (shouldDelayForTsunami || shouldDelayForMap)) {
          window.__delayedGoalNotifications = window.__delayedGoalNotifications || [];
          // Avoid pushing duplicates
          if (!window.__delayedGoalNotifications.some(n => n.id === goal.id)) {
            window.__delayedGoalNotifications.push({ id: goal.id, text: notifText, icon: goal.icon, notifKey });
          }
        } else {
          showNotification(notifText, goal.icon);
          localStorage.setItem(notifKey, '1');
        }
      }
    } else {

      if (!activeGoal) {
        activeGoal = goal;
        allComplete = false;
      }
    }
  }


  const showUI = settingsManager.get('user_interface');
  const showProgressBar = settingsManager.get('game_progress_bar');
  const shouldShow = showUI && showProgressBar;

  if (allComplete) {
    if (shouldShow) {
      wrapper.classList.add('has-goal-bar');
    } else {
      wrapper.classList.remove('has-goal-bar');
    }
    fill.style.width = '100%';
    textEl.textContent = 'You are winner!!!';
    return;
  }

  if (activeGoal) {
    if (shouldShow) {
      wrapper.classList.add('has-goal-bar');
    } else {
      wrapper.classList.remove('has-goal-bar');
    }

    let current = activeGoal.getCurrent();
    let target = activeGoal.target;
    let start = activeGoal.start;
    
    // Clamp
    if (current < start) current = start;
    if (current > target) current = target;

    let percentage = 0;

    if (activeGoal.mode === GOAL_MODE.NORMAL) {
      if (target > start) {
        percentage = ((current - start) / (target - start)) * 100;
      }
    } else if (activeGoal.mode === GOAL_MODE.LOGARITHMIC) {
      if (target > start) {
        let logCurrent = current === 0 ? 0 : Math.log10(current);
        let logStart = start === 0 ? 0 : Math.log10(start);
        let logTarget = target === 0 ? 0 : Math.log10(target);
        if (logTarget > logStart) {
          percentage = ((logCurrent - logStart) / (logTarget - logStart)) * 100;
        }
      }
    }
    
    percentage = Math.max(0, Math.min(100, percentage));

    if (activeGoal.id === 2 && percentage >= 99 && !isForgeUnlocked()) {
      percentage = 99;
    } else if (activeGoal.id === 3 && percentage >= 99 && !isInfuseUnlocked()) {
      percentage = 99;
    } else if (activeGoal.id === 4 && percentage >= 99 && !isSurgeUnlocked()) {
      percentage = 99;
    }

    textEl.textContent = `${activeGoal.text} (${Math.floor(percentage)}%)`;
    fill.style.width = `${percentage}%`;
  } else {
    wrapper.classList.remove('has-goal-bar');
  }
}
