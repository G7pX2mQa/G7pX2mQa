import { getMutationState } from './mutationSystem.js';
import { IS_MOBILE } from '../main.js';
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
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a bronze color`,
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 2 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    },
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 5,
    title: "Silver Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a silver color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 2) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 2 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 2 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 3 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 8,
    title: "Gold Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a gold color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 3) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 3 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 3 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 4 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 11,
    title: "Sapphire Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a sapphire color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 4) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 4 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 4 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 5 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 14,
    title: "Emerald Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to an emerald color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 5) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 5 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 5 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 6 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 17,
    title: "Ruby Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a ruby color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 6) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 6 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 6 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 7 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 20,
    title: "Amethyst Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to an amethyst color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 7) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 7 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 7 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 8 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 23,
    title: "Sunset Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a sunset color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 8) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 8 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 8 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 9 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 26,
    title: "Void Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a void color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 9) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 9 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 9 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 10 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 29,
    title: "Ethereal Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to an ethereal color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 10) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 10 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 10 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 11 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 32,
    title: "Earth Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to an earth color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 11) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 11 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 11 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 12 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 35,
    title: "Air Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to an air color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 12) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 12 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 12 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 13 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 38,
    title: "Fire Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a fire color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 13) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 13 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 13 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 14 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 41,
    title: "Water Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a water color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 14) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 14 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 14 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 15 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 44,
    title: "Cookie Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a cookie color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 15) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 15 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
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
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 15 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 46,
    title: "Raleway",
    desc: "Changes the game's font to Raleway",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 16) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 16 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 47,
    title: "Pancake Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a pancake color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 16) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 16 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 48,
    title: "Pancake Magnet",
    desc: "Changes the magnet indicator to a pancake color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1600,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 16) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 16 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 49,
    title: "Montserrat",
    desc: "Changes the game's font to Montserrat",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 17) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 17 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 50,
    title: "Watermelon Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a watermelon color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 17) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 17 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 51,
    title: "Watermelon Magnet",
    desc: "Changes the magnet indicator to a watermelon color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1700,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 17) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 17 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 52,
    title: "Oswald",
    desc: "Changes the game's font to Oswald",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 18) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 18 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 53,
    title: "Pepperoni Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a pepperoni color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 18) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 18 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 54,
    title: "Pepperoni Magnet",
    desc: "Changes the magnet indicator to a pepperoni color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1800,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 18) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 18 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 55,
    title: "Playfair Display",
    desc: "Changes the game's font to Playfair Display",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 1900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 19) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 19 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 56,
    title: "Pizza Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a pizza color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 1900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 19) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 19 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 57,
    title: "Pizza Magnet",
    desc: "Changes the magnet indicator to a pizza color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 1900,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 19) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 19 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 58,
    title: "Poppins",
    desc: "Changes the game's font to Poppins",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 2000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 20) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 20 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 59,
    title: "Donut Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a donut color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 2000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 20) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 20 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 60,
    title: "Donut Magnet",
    desc: "Changes the magnet indicator to a donut color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 2000,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 20) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 20 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 61,
    title: "Mukta",
    desc: "Changes the game's font to Mukta",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 2100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 21) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 21 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 62,
    title: "Glass Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a glass color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 2100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 21) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 21 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 63,
    title: "Glass Magnet",
    desc: "Changes the magnet indicator to a glass color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 2100,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 21) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 21 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 64,
    title: "Quicksand",
    desc: "Changes the game's font to Quicksand",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 2200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 22) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 22 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 65,
    title: "Diamond Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a diamond color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 2200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 22) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 22 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 66,
    title: "Diamond Magnet",
    desc: "Changes the magnet indicator to a diamond color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 2200,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 22) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 22 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 67,
    title: "Fira Sans",
    desc: "Changes the game's font to Fira Sans",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 2300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 23) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 23 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 68,
    title: "Opal Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to an opal color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 2300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 23) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 23 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 69,
    title: "Opal Magnet",
    desc: "Changes the magnet indicator to an opal color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 2300,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 23) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 23 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 70,
    title: "Dosis",
    desc: "Changes the game's font to Dosis",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 2400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 24) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 24 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 71,
    title: "Cosmic Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a cosmic color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 2400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 24) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 24 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 72,
    title: "Cosmic Magnet",
    desc: "Changes the magnet indicator to a cosmic color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 2400,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 24) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 24 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 73,
    title: "Rajdhani",
    desc: "Changes the game's font to Rajdhani",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "font",
    costAtLevel: () => 2500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 25) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 25 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 74,
    title: "Prismatic Trail",
    desc: () => `Changes the ${IS_MOBILE ? 'finger' : 'cursor'} trail to a prismatic color`,
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "trail",
    costAtLevel: () => 2500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 25) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 25 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  },
  {
    area: RAINBOW_GEM_AREA_KEY,
    id: 75,
    title: "Prismatic Magnet",
    desc: "Changes the magnet indicator to a prismatic color",
    lvlCap: 1,
    costType: "rainbowGems",
    upgType: "TM",
    modType: "magnet",
    costAtLevel: () => 2500,
    icon: "img/currencies/rainbow_gem.webp",
    computeLockState(ctx) {
      const mState = getMutationState();
      if (!mState.unlocked || levelBigNumToNumber(mState.level) < 25) {
        return { state: 'mysterious', unlockReqText: "Reach Mutation Level 25 to reveal this upgrade" };
      }
      return { state: 'unlocked' };
    }
  }
];
