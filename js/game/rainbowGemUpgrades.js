import { getMutationState } from './mutationSystem.js';
import { levelBigNumToNumber } from './upgrades.js';

export const RAINBOW_GEM_AREA_KEY = 'rainbow_gem_shop';

export const RAINBOW_GEM_UPGRADES = [
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 1,
    title: "Times New Roman",
    desc: "Changes the game's font to Times New Roman",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 100,
    icon: "img/currencies/rainbow_gem.webp",
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 2,
    title: "Bronze Trail",
    desc: "Changes the cursor trail to a bronze color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 100,
    icon: "img/currencies/rainbow_gem.webp"
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 3,
    title: "Bronze Magnet",
    desc: "Changes the magnet indicator to a bronze color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 100,
    icon: "img/currencies/rainbow_gem.webp"
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 4,
    title: "Arial Font",
    desc: "Changes the game's font to Arial",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 200,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the cursor trail to a silver color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 200,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the magnet indicator to a silver color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 200,
    icon: "img/currencies/rainbow_gem.webp",
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
    title: "Courier New",
    desc: "Changes the game's font to Courier New",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 300,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the cursor trail to a gold color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 300,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the magnet indicator to a gold color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 300,
    icon: "img/currencies/rainbow_gem.webp",
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
    title: "Verdana",
    desc: "Changes the game's font to Verdana",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 400,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the cursor trail to a sapphire color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 400,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the magnet indicator to a sapphire color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 400,
    icon: "img/currencies/rainbow_gem.webp",
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
    title: "Tahoma",
    desc: "Changes the game's font to Tahoma",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 500,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the cursor trail to an emerald color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 500,
    icon: "img/currencies/rainbow_gem.webp",
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
    desc: "Changes the magnet indicator to an emerald color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 500,
    icon: "img/currencies/rainbow_gem.webp",
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
    id: 16,
    title: "Comic Neue",
    desc: "Changes the game's font to Comic Neue",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 6) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 6 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 6 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 17,
    title: "Ruby Trail",
    desc: "Changes the cursor trail to a ruby color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 6) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 6 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 6 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 18,
    title: "Ruby Magnet",
    desc: "Changes the magnet indicator to a ruby color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 6) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 6 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 6 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 19,
    title: "Georgia",
    desc: "Changes the game's font to Georgia",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 7) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 7 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 7 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 20,
    title: "Amethyst Trail",
    desc: "Changes the cursor trail to an amethyst color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 7) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 7 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 7 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 21,
    title: "Amethyst Magnet",
    desc: "Changes the magnet indicator to an amethyst color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 7) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 7 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 7 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 22,
    title: "Impact",
    desc: "Changes the game's font to Impact",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 8) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 8 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 8 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 23,
    title: "Sunset Trail",
    desc: "Changes the cursor trail to a sunset color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 8) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 8 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 8 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 24,
    title: "Sunset Magnet",
    desc: "Changes the magnet indicator to a sunset color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 8) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 8 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 8 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 25,
    title: "Arimo",
    desc: "Changes the game's font to Arimo",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 9) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 9 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 9 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 26,
    title: "Void Trail",
    desc: "Changes the cursor trail to a void color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 9) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 9 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 9 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 27,
    title: "Void Magnet",
    desc: "Changes the magnet indicator to a void color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 9) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 9 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 9 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 28,
    title: "Lucida Console",
    desc: "Changes the game's font to Lucida Console",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 10) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 10 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 10 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 29,
    title: "Ethereal Trail",
    desc: "Changes the cursor trail to an ethereal color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 10) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 10 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 10 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 30,
    title: "Ethereal Magnet",
    desc: "Changes the magnet indicator to an ethereal color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 10) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 10 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 10 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  }
];
