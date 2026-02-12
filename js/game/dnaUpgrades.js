export const DNA_AREA_KEY = 'dna';

export const REGISTRY = [
  {
    area: DNA_AREA_KEY,
    id: 1,
    title: "DNA Coin Value",
    desc: "Multiplies Coin value by 1.1x per level",
    lvlCap: 1000,
    baseCost: 1000,
    costType: "dna",
    upgType: "HM",
    scalingPreset: 'HM',
    icon: "sc_upg_icons/coin_val_dna.webp",
    baseIconOverride: "img/currencies/dna/dna_base.webp",
    effectType: "coin_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM'
  },
  {
    area: DNA_AREA_KEY,
    id: 2,
    title: "DNA XP Value",
    desc: "Multiplies XP value by 1.1x per level",
    lvlCap: 1000,
    baseCost: 1000,
    costType: "dna",
    upgType: "HM",
    scalingPreset: 'HM',
    icon: "sc_upg_icons/xp_val_dna.webp",
    baseIconOverride: "img/currencies/dna/dna_base.webp",
    effectType: "xp_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM'
  },
  {
    area: DNA_AREA_KEY,
    id: 3,
    title: "DNA Gold Value",
    desc: "Multiplies Gold value by 1.1x per level",
    lvlCap: 1000,
    baseCost: 1e12,
    costType: "dna",
    upgType: "HM",
    scalingPreset: 'HM',
    icon: "sc_upg_icons/gold_val_dna.webp",
    baseIconOverride: "img/currencies/dna/dna_base.webp",
    effectType: "gold_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    computeLockState(ctx) {
      const surgeLevel = ctx.currentSurgeLevel;
      const constants = ctx.constants || {};
      
      let isUnlocked = false;
      if (surgeLevel === Infinity || (typeof surgeLevel === 'string' && surgeLevel === 'Infinity')) {
          isUnlocked = true;
      } else if (typeof surgeLevel === 'bigint') {
          isUnlocked = surgeLevel >= 10n;
      } else if (typeof surgeLevel === 'number') {
          isUnlocked = surgeLevel >= 10;
      }
      
      if (isUnlocked) {
          return { locked: false };
      }
      
      const revealText = "Reach Surge 10 to reveal this upgrade";
      return {
          locked: true,
          iconOverride: constants.MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          titleOverride: constants.HIDDEN_UPGRADE_TITLE,
          descOverride: revealText,
          reason: revealText,
          hidden: true,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
      };
    }
  },
  {
    area: DNA_AREA_KEY,
    id: 4,
    title: "DNA Magic Value",
    desc: "Multiplies Magic value by 1.1x per level",
    lvlCap: 1000,
    baseCost: 1e12,
    costType: "dna",
    upgType: "HM",
    scalingPreset: 'HM',
    icon: "sc_upg_icons/magic_val_dna.webp",
    baseIconOverride: "img/currencies/dna/dna_base.webp",
    effectType: "magic_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    computeLockState(ctx) {
      const surgeLevel = ctx.currentSurgeLevel;
      const constants = ctx.constants || {};
      
      let isUnlocked = false;
      if (surgeLevel === Infinity || (typeof surgeLevel === 'string' && surgeLevel === 'Infinity')) {
          isUnlocked = true;
      } else if (typeof surgeLevel === 'bigint') {
          isUnlocked = surgeLevel >= 10n;
      } else if (typeof surgeLevel === 'number') {
          isUnlocked = surgeLevel >= 10;
      }
      
      if (isUnlocked) {
          return { locked: false };
      }
      
      const revealText = "Reach Surge 10 to reveal this upgrade";
      return {
          locked: true,
          iconOverride: constants.MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          titleOverride: constants.HIDDEN_UPGRADE_TITLE,
          descOverride: revealText,
          reason: revealText,
          hidden: true,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
      };
    }
  }
];
