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
  }
];
