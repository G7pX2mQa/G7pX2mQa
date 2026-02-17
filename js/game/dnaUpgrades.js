import { formatMultForUi } from '../util/numFormat.js';

export const DNA_AREA_KEY = 'dna';

const MYSTERIOUS_ICON = 'img/misc/mysterious.webp';
const HIDDEN_TITLE = 'Hidden Upgrade';

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
    baseIconOverride: "currencies/dna/dna_base.webp",
    effectType: "coin_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    bonusLine: (level, total) => `Coin value bonus: ${formatMultForUi(total)}x`
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
    baseIconOverride: "currencies/dna/dna_base.webp",
    effectType: "xp_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    bonusLine: (level, total) => `XP value bonus: ${formatMultForUi(total)}x`
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
    baseIconOverride: "currencies/dna/dna_base.webp",
    effectType: "gold_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    bonusLine: (level, total) => `Gold value bonus: ${formatMultForUi(total)}x`,
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 10 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'bigint') {
            if (sl >= 10n) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 10) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };
        
        const revealText = "Reach Surge 10 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_ICON,
            titleOverride: HIDDEN_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
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
    baseIconOverride: "currencies/dna/dna_base.webp",
    effectType: "magic_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    bonusLine: (level, total) => `Magic value bonus: ${formatMultForUi(total)}x`,
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 10 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'bigint') {
            if (sl >= 10n) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 10) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };
        
        const revealText = "Reach Surge 10 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_ICON,
            titleOverride: HIDDEN_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  },
  {
    area: DNA_AREA_KEY,
    id: 5,
    title: "DNA Wave Value",
    desc: "Multiplies Wave value by 1.1x per level",
    lvlCap: 1000,
    baseCost: 1e39,
    costType: "dna",
    upgType: "HM",
    scalingPreset: 'HM',
    icon: "sc_upg_icons/wave_val_dna.webp",
    baseIconOverride: "currencies/dna/dna_base.webp",
    effectType: "wave_value",
    _dnaEffectVal: 1.1,
    _costScaling: 'HM',
    bonusLine: (level, total) => `Wave value bonus: ${formatMultForUi(total)}x`,
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 19 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'bigint') {
            if (sl >= 19n) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 19) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };
        
        const revealText = "Reach Surge 19 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_ICON,
            titleOverride: HIDDEN_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  }
];
