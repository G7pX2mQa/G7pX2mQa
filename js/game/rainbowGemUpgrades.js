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
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 100,
    icon: "img/currencies/coin/coin.webp",
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 2,
    title: "Bronze Trail",
    desc: "Changes the cursor trail color to bronze.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
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
    upgType: "TM",
    modType: "magnet",
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
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 200,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 2 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 2 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp",
          hideCost: true,
          hideEffect: true,
          useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    },
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 5,
    title: "Silver Trail",
    desc: "Changes the cursor trail color to silver.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 200,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 2 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
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
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 200,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 2 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
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
    id: 7,
    title: "Courier New Font",
    desc: "Changes the game's font to Courier New.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 300,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 3) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 3 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 3 to reveal this upgrade",
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
    id: 8,
    title: "Gold Trail",
    desc: "Changes the cursor trail color to gold.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 300,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 3) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 3 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 3 to reveal this upgrade",
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
    id: 9,
    title: "Gold Magnet",
    desc: "Changes the magnet radius indicator color to gold.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 300,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 3) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 3 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 3 to reveal this upgrade",
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
    id: 10,
    title: "Verdana Font",
    desc: "Changes the game's font to Verdana.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 400,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 4) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 4 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 4 to reveal this upgrade",
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
    id: 11,
    title: "Sapphire Trail",
    desc: "Changes the cursor trail color to sapphire.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 400,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 4) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 4 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 4 to reveal this upgrade",
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
    id: 12,
    title: "Sapphire Magnet",
    desc: "Changes the magnet radius indicator color to sapphire.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 400,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 4) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 4 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 4 to reveal this upgrade",
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
    id: 13,
    title: "Tahoma Font",
    desc: "Changes the game's font to Tahoma.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 500,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 5) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 5 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 5 to reveal this upgrade",
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
    id: 14,
    title: "Emerald Trail",
    desc: "Changes the cursor trail color to emerald.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 500,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 5) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 5 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 5 to reveal this upgrade",
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
    id: 15,
    title: "Emerald Magnet",
    desc: "Changes the magnet radius indicator color to emerald.",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 500,
    icon: "img/currencies/coin/coin.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 5) {
        return {
          locked: true,
          hidden: true,
          reason: "Reach Mutation Level 5 to reveal this upgrade",
          titleOverride: "Hidden Upgrade",
          descOverride: "Reach Mutation Level 5 to reveal this upgrade",
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
