import { getMutationState } from './mutationSystem.js';
import { levelBigNumToNumber } from './upgrades.js';

export const RAINBOW_GEM_AREA_KEY = 'rainbow_gem_shop';

export const RAINBOW_GEM_UPGRADES = [
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 1,
    title: "Classic Font",
    desc: "Changes the game's font to Times New Roman.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "NM",
    costAtLevel: () => 100,
    icon: "img/currencies/coin/coin.webp",
    onLevelChange(payload) {
      if (typeof document === 'undefined') return;
      if (payload.newLevel >= 1) {
        document.body.classList.add('font-times-new-roman');
      } else {
        document.body.classList.remove('font-times-new-roman');
      }
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 2,
    title: "Bronze Trail",
    desc: "Changes the cursor trail color to bronze.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "NM",
    costAtLevel: () => 100,
    icon: "img/currencies/coin/coin.webp"
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 3,
    title: "Bronze Magnet",
    desc: "Changes the magnet radius indicator color to bronze.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "NM",
    costAtLevel: () => 100,
    icon: "img/currencies/coin/coin.webp"
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 4,
    title: "Arial Font",
    desc: "Changes the game's font to Arial.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "NM",
    costAtLevel: () => 200,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 2 to reveal this upgrade",
          titleOverride: "???",
          descOverride: "Reach Mutation Level 2 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp",
          hideCost: true,
          hideEffect: true,
          useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    },
    onLevelChange(payload) {
      if (typeof document === 'undefined') return;
      if (payload.newLevel >= 1) {
        document.body.classList.add('font-arial');
      } else {
        document.body.classList.remove('font-arial');
      }
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 5,
    title: "Silver Trail",
    desc: "Changes the cursor trail color to silver.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "NM",
    costAtLevel: () => 200,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 2 to reveal this upgrade",
          titleOverride: "???",
          descOverride: "Reach Mutation Level 2 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp",
          hideCost: true,
          hideEffect: true,
          useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 6,
    title: "Silver Magnet",
    desc: "Changes the magnet radius indicator color to silver.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "NM",
    costAtLevel: () => 200,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 2 to reveal this upgrade",
          titleOverride: "???",
          descOverride: "Reach Mutation Level 2 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp",
          hideCost: true,
          hideEffect: true,
          useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  }
];
