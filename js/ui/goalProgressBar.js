import { getActiveSlot } from '../util/storage.js';
import { getXpState } from '../game/xpSystem.js';
import { levelBigNumToNumber } from '../game/upgrades.js';
import { registerFrame } from '../game/gameLoop.js';
import { settingsManager } from '../game/settingsManager.js';
import { showNotification } from '../ui/notifications.js';

const GOAL_MODE = {
  NORMAL: 'normal',
  LOGARITHMIC: 'logarithmic'
};

const GOALS = [
  {
    id: 'collect_10_coins',
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
    id: 'unlock_xp_reach_31',
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
      return levelBigNumToNumber(xpState.xpLevel) >= 31;
    }
  }
];

let initialized = false;

export function initGoalProgressBar() {
  if (initialized) return;
  initialized = true;

  registerFrame(updateGoalProgressBar);
}

function updateGoalProgressBar() {
  const wrapper = document.getElementById('hud-bottom-wrapper');
  const bar = document.getElementById('goal-progress-bar');
  const fill = document.getElementById('goal-bar-fill');
  const textEl = document.getElementById('goal-bar-text');

  if (!wrapper || !bar || !fill || !textEl) return;


  let activeGoal = null;
  let allComplete = true;

  const slot = getActiveSlot();

  for (const goal of GOALS) {
    const isComp = goal.isComplete();
    const notifKey = `ccc:goal:notified:${slot}:${goal.id}`;
    
    if (isComp) {
      if (!localStorage.getItem(notifKey)) {
        let notifText = "Goal complete!";
        if (goal.unlocksHelpText) {
          notifText += '<br><span class="notification-subtext">New help text unlocked</span>';
        }
        showNotification(notifText, goal.icon);
        localStorage.setItem(notifKey, '1');
      }
    } else {
      if (!activeGoal) {
        activeGoal = goal;
        allComplete = false;
      }
    }
  }


  const showUI = settingsManager.get('user_interface');
  const showProgressBar = settingsManager.get('show_progress_bar');
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

    textEl.textContent = `${activeGoal.text} (${Math.floor(percentage)}%)`;
    fill.style.width = `${percentage}%`;
  } else {
    wrapper.classList.remove('has-goal-bar');
  }
}
