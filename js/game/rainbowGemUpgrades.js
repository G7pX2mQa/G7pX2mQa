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
    iconPath: "img/currencies/coin/coin.webp",
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
    iconPath: "img/currencies/coin/coin.webp"
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
    iconPath: "img/currencies/coin/coin.webp"
  }
];
