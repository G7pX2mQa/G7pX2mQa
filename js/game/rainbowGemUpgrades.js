import { getMutationState } from './mutationSystem.js';
import { levelBigNumToNumber } from './upgrades.js';

export const RAINBOW_GEM_AREA_KEY = 'rainbow_gem_shop';

export const RAINBOW_GEM_UPGRADES = [
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 1,
    title: "Tinos",
    desc: "Changes the game's font to Tinos",
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
    title: "Roboto",
    desc: "Changes the game's font to Roboto",
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
    title: "Cousine",
    desc: "Changes the game's font to Cousine",
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
    title: "Nunito",
    desc: "Changes the game's font to Nunito",
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
    title: "Open Sans",
    desc: "Changes the game's font to Open Sans",
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
    title: "Merriweather",
    desc: "Changes the game's font to Merriweather",
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
    title: "Anton",
    desc: "Changes the game's font to Anton",
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
    title: "Roboto",
    desc: "Changes the game's font to Roboto",
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
    title: "Inconsolata",
    desc: "Changes the game's font to Inconsolata",
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
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 31,
    title: "Lora",
    desc: "Changes the game's font to Lora",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 11) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 11 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 11 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 32,
    title: "Earth Trail",
    desc: "Changes the cursor trail to an earth color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 11) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 11 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 11 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 33,
    title: "Earth Magnet",
    desc: "Changes the magnet indicator to an earth color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 11) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 11 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 11 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 34,
    title: "Noto Sans",
    desc: "Changes the game's font to Noto Sans",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 12) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 12 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 12 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 35,
    title: "Air Trail",
    desc: "Changes the cursor trail to an air color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 12) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 12 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 12 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 36,
    title: "Air Magnet",
    desc: "Changes the magnet indicator to an air color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 12) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 12 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 12 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 37,
    title: "PT Sans",
    desc: "Changes the game's font to PT Sans",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 13) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 13 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 13 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 38,
    title: "Fire Trail",
    desc: "Changes the cursor trail to a fire color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 13) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 13 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 13 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 39,
    title: "Fire Magnet",
    desc: "Changes the magnet indicator to a fire color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 13) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 13 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 13 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 40,
    title: "Ubuntu",
    desc: "Changes the game's font to Ubuntu",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 14) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 14 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 14 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 41,
    title: "Water Trail",
    desc: "Changes the cursor trail to a water color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 14) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 14 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 14 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 42,
    title: "Water Magnet",
    desc: "Changes the magnet indicator to a water color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 14) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 14 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 14 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 43,
    title: "Source Sans 3",
    desc: "Changes the game's font to Source Sans 3",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 15) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 15 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 15 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 44,
    title: "Cookie Trail",
    desc: "Changes the cursor trail to a cookie color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 15) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 15 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 15 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 45,
    title: "Cookie Magnet",
    desc: "Changes the magnet indicator to a cookie color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 15) {
        return {
          locked: true, hidden: true,
          reason: "Reach Mutation Level 15 to reveal this upgrade",
          titleOverride: "Hidden Upgrade", descOverride: "Reach Mutation Level 15 to reveal this upgrade",
          iconOverride: "img/misc/mysterious.webp", hideCost: true, hideEffect: true, useLockedBase: true
        };
      }
      return { locked: false, hidden: false };
    }
  }
];
