import { getBuildingLevel, getBuildingBonus } from '../ui/minerTabs/buildingsTab.js';
import { BigNum, bigNumIsInfinite } from '../util/bigNum.js';
import { bank, UC_MATERIALS } from '../util/storage.js';
import { initResetSystem } from '../ui/merchantTabs/resetTab.js';
import { getLabWaveMultiplier, getLabDnaMultiplier } from './labNodes.js';
import { addExternalMutationGainMultiplierProvider } from './mutationSystem.js';
import { getSurgeMagicMultiplier, getSurgeWaveMultiplier, getSurgeDnaMultiplier } from './surgeEffects.js';
import { addExternalFpMultiplierProvider, getWaterwheelGoldMultiplier, getWaterwheelMagicMultiplier, getWaterwheelScrapMultiplier } from '../ui/merchantTabs/flowTab.js';
import { addExternalDpMultiplierProvider } from './dpSystem.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';
import { loadGenerationLevel, getGearsPerSecond } from "../ui/merchantTabs/workshopTab.js";
import { getPpState, isPpSystemUnlocked } from './ppSystem.js';

import {
  addExternalCoinMultiplierProvider,
  addExternalXpGainMultiplierProvider,
  isXpSystemUnlocked,
} from './xpSystem.js';
import {
  REGISTRY,
  AREA_KEYS,
  getUpgradesForArea,
  getLevel,
  getLevelNumber,
  computeHmMultipliers,
  safeMultiplyBigNum,
  ensureLevelBigNum,
  levelBigNumToNumber,
  normalizedUpgradeLevel,
  bigNumFromLog10,
  UPGRADE_TIES
} from './upgrades.js';

const BASE_CPS = 1;

let _cachedUpgradeMultipliers = {};
let listeners = [];

const externalSpawnRateProviders = [];
const externalCoresMultiplierProviders = [];
const externalCrystalsMultiplierProviders = [];

export function addExternalCoresMultiplierProvider(provider) {
    externalCoresMultiplierProviders.push(provider);
}

export function addExternalCrystalsMultiplierProvider(provider) {
    externalCrystalsMultiplierProviders.push(provider);
}

export function addExternalSpawnRateMultiplierProvider(provider) {
  if (typeof provider === 'function') {
    externalSpawnRateProviders.push(provider);
  }
}

export function invalidateEffectsCache() {
  _cachedUpgradeMultipliers = {};
}

export function triggerUpgradesChanged() {
  _cachedUpgradeMultipliers = {};
  try { listeners.forEach(cb => cb()); } catch {}
  try { document.dispatchEvent(new CustomEvent('ccc:upgrades:changed')); } catch {}
}

export function onUpgradesChanged(cb) {
  if (typeof cb === 'function') listeners.push(cb);
  return () => { listeners = listeners.filter(x => x !== cb); };
}

export function bookValueMultiplierBn(level) {
  const L = ensureLevelBigNum(level);
  try {
    const plain = L?.inf || L?.e >= 15 ? 'Infinity' : L?.toPlainIntegerString?.();
    if (plain && plain !== 'Infinity' && plain.length <= 15) {
      const lvl = Math.max(0, Number(plain));
      return bigNumFromLog10(lvl * Math.log10(2)).floorToInteger();
    }
  } catch {}

  return BigNum.fromAny('Infinity');
}

function safeIsXpUnlocked() {
  try {
    return !!isXpSystemUnlocked();
  } catch {
    return false;
  }
}

export function syncBookCurrencyMultiplierFromUpgrade(levelOverride) {
  const multHandle = bank?.books?.mult;
  if (!multHandle || typeof multHandle.set !== 'function') return;

  let resolvedLevel = 0;
  const xpUnlocked = safeIsXpUnlocked();
  if (xpUnlocked) {
    if (Number.isFinite(levelOverride)) {
      resolvedLevel = Math.max(0, Math.floor(levelOverride));
    } else {
      const storedLevel = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.BOOK_VALUE_I);
      resolvedLevel = Math.max(0, Number.isFinite(storedLevel) ? storedLevel : 0);
    }
  }

  let multiplier;
  try {
    multiplier = bookValueMultiplierBn(resolvedLevel);
  } catch {
    multiplier = BigNum.fromInt(1);
  }

  try {
    const finalBookValue = applyStatMultiplierOverride('books', multiplier.clone?.() ?? multiplier);
    multHandle.set(finalBookValue);
  } catch {}
}

export function calculateUpgradeMultipliers(areaKey = AREA_KEYS.STARTER_COVE) {
  if (_cachedUpgradeMultipliers[areaKey]) return _cachedUpgradeMultipliers[areaKey];

  const upgrades = getUpgradesForArea(areaKey);
  const additionalUpgrades = [];
  if (areaKey === AREA_KEYS.STARTER_COVE && AREA_KEYS.DNA) {
    const dnaUpgrades = getUpgradesForArea(AREA_KEYS.DNA);
    additionalUpgrades.push(...dnaUpgrades);
    
    // Also include Underwater Cavern upgrades as they affect things like coin value globally too
    if (AREA_KEYS.UNDERWATER_CAVERN) {
        const ucUpgrades = getUpgradesForArea(AREA_KEYS.UNDERWATER_CAVERN);
        additionalUpgrades.push(...ucUpgrades);
    }
  }
  const allUpgrades = [...upgrades, ...additionalUpgrades];

  const acc = {
    coinValue: BigNum.fromInt(1),
    xpValue: BigNum.fromInt(1),
    mpValue: BigNum.fromInt(1),
    scrapValue: BigNum.fromInt(1),
    goldValue: BigNum.fromInt(1),
    magicValue: BigNum.fromInt(1),
    waveValue: BigNum.fromInt(1),
    dnaValue: BigNum.fromInt(1),
    bookValue: BigNum.fromInt(1),
    fpValue: BigNum.fromInt(1),
    dpValue: BigNum.fromInt(1),
    allMaterialsValue: BigNum.fromInt(1),
    coresValue: BigNum.fromInt(1),
    crystalsValue: BigNum.fromInt(1),
    rpValue: BigNum.fromInt(1),
    coinSpawn: 1.0,
    materialSpawn: 1.0,
    magnetRadius: 0,
  };

  for (const upg of allUpgrades) {
    if (!upg.effectType) continue;

    const effectiveArea = upg.area || areaKey;
    const lvlBn = getLevel(effectiveArea, upg.id);
    const lvlNum = levelBigNumToNumber(lvlBn);

    let baseEffect = null;
    if (typeof upg.effectMultiplier === 'function') {
      baseEffect = upg.effectMultiplier(lvlNum);
      if (!(baseEffect instanceof BigNum) && typeof baseEffect !== 'number') {
        baseEffect = BigNum.fromAny(baseEffect ?? 1);
      }
    } else {
      baseEffect = BigNum.fromInt(1);
    }

    if (upg.upgType === 'HM') {
      const { selfMult, xpMult, coinMult, mpMult, scrapMult, dpMult, allMaterialsMult } = computeHmMultipliers(upg, lvlBn, effectiveArea);
      acc.xpValue = safeMultiplyBigNum(acc.xpValue, xpMult);
      acc.coinValue = safeMultiplyBigNum(acc.coinValue, coinMult);
      acc.mpValue = safeMultiplyBigNum(acc.mpValue, mpMult);
      acc.scrapValue = safeMultiplyBigNum(acc.scrapValue, scrapMult);
      acc.dpValue = safeMultiplyBigNum(acc.dpValue, dpMult);
      acc.allMaterialsValue = safeMultiplyBigNum(acc.allMaterialsValue, allMaterialsMult);

      
      baseEffect = safeMultiplyBigNum(baseEffect, selfMult);
    }

    if (upg.effectType === 'coin_spawn') {
      let val = 1;
      if (baseEffect instanceof BigNum) {
        try { val = Number(baseEffect.toScientific()); } catch { val = 1; }
      } else {
        val = Number(baseEffect);
      }
      acc.coinSpawn *= val;
    } else if (upg.effectType === 'material_spawn') {
      let val = 1;
      if (baseEffect instanceof BigNum) {
        try { val = Number(baseEffect.toScientific()); } catch { val = 1; }
      } else {
        val = Number(baseEffect);
      }
      acc.materialSpawn *= val;
    } else if (upg.effectType === 'coin_value') {
      acc.coinValue = safeMultiplyBigNum(acc.coinValue, baseEffect);
    } else if (upg.effectType === 'xp_value') {
      acc.xpValue = safeMultiplyBigNum(acc.xpValue, baseEffect);
    } else if (upg.effectType === 'mp_value') {
      acc.mpValue = safeMultiplyBigNum(acc.mpValue, baseEffect);
    } else if (upg.effectType === 'gold_value') {
      acc.goldValue = safeMultiplyBigNum(acc.goldValue, baseEffect);
    } else if (upg.effectType === 'magic_value') {
      acc.magicValue = safeMultiplyBigNum(acc.magicValue, baseEffect);
    } else if (upg.effectType === 'wave_value') {
      acc.waveValue = safeMultiplyBigNum(acc.waveValue, baseEffect);
    } else if (upg.effectType === 'dna_value') {
      acc.dnaValue = safeMultiplyBigNum(acc.dnaValue, baseEffect);
    } else if (upg.effectType === 'book_value') {
      acc.bookValue = safeMultiplyBigNum(acc.bookValue, baseEffect);
    } else if (upg.effectType === 'fp_value') {
      acc.fpValue = safeMultiplyBigNum(acc.fpValue, baseEffect);
    } else if (upg.effectType === 'dp_value') {
      acc.dpValue = safeMultiplyBigNum(acc.dpValue, baseEffect);
    } else if (upg.effectType === 'all_materials_value') {
      acc.allMaterialsValue = safeMultiplyBigNum(acc.allMaterialsValue, baseEffect);
    } else if (upg.effectType === 'cores_value') {
      acc.coresValue = safeMultiplyBigNum(acc.coresValue, baseEffect);
    } else if (upg.effectType === 'crystals_value') {
      acc.crystalsValue = safeMultiplyBigNum(acc.crystalsValue, baseEffect);
    } else if (upg.effectType === 'rp_value') {
      acc.rpValue = safeMultiplyBigNum(acc.rpValue, baseEffect);
    } else if (upg.effectType === 'magnet_radius') {
      let val = 0;
      if (baseEffect instanceof BigNum) {
        try { val = Number(baseEffect.toScientific()); } catch { val = 0; }
      } else {
        val = Number(baseEffect);
      }
      if (Number.isFinite(val)) {
        acc.magnetRadius += val;
      }
    }
  }
  // Pressure bonuses
  try {
      if (isPpSystemUnlocked()) {
          const ppLevel = getPpState().ppLevel;
          if (ppLevel && !ppLevel.isZero()) {
              const ppLevelNum = (bigNumIsInfinite(ppLevel) ? Infinity : (ppLevel.sig * Math.pow(10, ppLevel.e)));
              if (!Number.isFinite(ppLevelNum) || ppLevelNum === Infinity) {
                  acc.allMaterialsValue = safeMultiplyBigNum(acc.allMaterialsValue, BigNum.fromAny('Infinity'));
              } else {
                  const ppFactor = bigNumFromLog10(ppLevelNum * Math.log10(2)).floorToInteger();
                  acc.allMaterialsValue = safeMultiplyBigNum(acc.allMaterialsValue, ppFactor).floorToInteger();
              }
          }
      }
  } catch (e) { console.error(e); }


  for (const provider of externalSpawnRateProviders) {
    try {
      const val = provider();
      if (Number.isFinite(val)) {
        acc.coinSpawn *= val;
      }
    } catch {}
  }

  _cachedUpgradeMultipliers[areaKey] = acc;
  return acc;
}

export function computeUpgradeEffects(areaKey) {
  const mults = calculateUpgradeMultipliers(areaKey);
  
  return {
    coinsPerSecondMult: mults.coinSpawn,
    materialSpawnRateMult: mults.materialSpawn,
    coinsPerSecondAbsolute: BASE_CPS * mults.coinSpawn,
    coinValueMultiplier: mults.coinValue,
    xpGainMultiplier: mults.xpValue,
    bookRewardMultiplier: mults.bookValue,
    goldValueMultiplier: mults.goldValue,
    magicValueMultiplier: mults.magicValue,
    dnaValueMultiplier: mults.dnaValue,
    allMaterialsValueMultiplier: mults.allMaterialsValue,
    coresValueMultiplier: mults.coresValue,
    crystalsValueMultiplier: mults.crystalsValue,
    scrapValueMultiplier: mults.scrapValue,
    dpValueMultiplier: mults.dpValue,
    rpValueMultiplier: mults.rpValue,
  };
}

export function syncCurrencyMultipliersFromUpgrades() {
  const { goldValue, magicValue, waveValue, dnaValue, allMaterialsValue, scrapValue, coresValue, crystalsValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
  
  try {
    if (bank.gold?.mult?.set) {
      const finalGoldValue = getWaterwheelGoldMultiplier(goldValue);
      bank.gold.mult.set(finalGoldValue);
    }
  } catch {}

  try {
    if (bank.magic?.mult?.set) {
      const surgeMult = getSurgeMagicMultiplier();
      let finalMagicValue = safeMultiplyBigNum(magicValue, surgeMult);
      finalMagicValue = getWaterwheelMagicMultiplier(finalMagicValue);
      bank.magic.mult.set(finalMagicValue);
    }
  } catch {}

  try {
    if (bank.waves?.mult?.set) {
      const labMult = getLabWaveMultiplier();
      const surgeWaveMult = getSurgeWaveMultiplier();
      const finalWaveValue = safeMultiplyBigNum(waveValue, safeMultiplyBigNum(labMult, surgeWaveMult));
      bank.waves.mult.set(finalWaveValue);
    }
  } catch {}

  try {
    if (bank.scrap?.mult?.set) {
      let finalScrapValue = getWaterwheelScrapMultiplier(scrapValue);
      try {
        const stoneBonus = getBuildingBonus('stone', getBuildingLevel('stone'));
        finalScrapValue = safeMultiplyBigNum(finalScrapValue, stoneBonus);
      } catch {}

      bank.scrap.mult.set(finalScrapValue);
    }
  } catch {}

try {
    if (bank.DNA?.mult?.set || bank.dna?.mult?.set) {
      const surgeDnaMult = getSurgeDnaMultiplier();
      let finalDnaValue = safeMultiplyBigNum(dnaValue, surgeDnaMult);
      
      const labDnaMult = getLabDnaMultiplier();
      finalDnaValue = safeMultiplyBigNum(finalDnaValue, labDnaMult);
      
      if (bank.DNA?.mult?.set) {
        bank.DNA.mult.set(finalDnaValue);
      } else if (bank.dna?.mult?.set) {
        bank.dna.mult.set(finalDnaValue);
      }
    }
  } catch {}

  try {
    if (bank.cores?.mult?.set) {
      let finalCoresValue = applyStatMultiplierOverride('cores', coresValue);
      for (const provider of externalCoresMultiplierProviders) {
        try {
          const val = provider(finalCoresValue);
          if (val instanceof BigNum) {
            finalCoresValue = val;
          } else if (val) {
            finalCoresValue = finalCoresValue.mulBigNumInteger(BigNum.fromAny(val));
          }
        } catch {}
      }
      bank.cores.mult.set(finalCoresValue);
    }
  } catch {}

  try {
    if (bank.crystals?.mult?.set) {
      let finalCrystalsValue = applyStatMultiplierOverride('crystals', crystalsValue);
      for (const provider of externalCrystalsMultiplierProviders) {
        try {
          const val = provider(finalCrystalsValue);
          if (val instanceof BigNum) {
            finalCrystalsValue = val;
          } else if (val) {
            finalCrystalsValue = finalCrystalsValue.mulBigNumInteger(BigNum.fromAny(val));
          }
        } catch {}
      }
      bank.crystals.mult.set(finalCrystalsValue);
    }
  } catch {}

  try {
  try {
    if (bank.gears?.mult?.set) {
      const level = loadGenerationLevel();
      const gearsRate = getGearsPerSecond(level);
      bank.gears.mult.set(gearsRate);
    }
  } catch {}

    for (const mat of UC_MATERIALS) {
      if (bank[mat]?.mult?.set) {
        // Individual material multipliers can be multiplied here in the future
        let finalMatValue = applyStatMultiplierOverride('allMaterials', allMaterialsValue);
        try {
            if (mat === 'stone') {
                const copperBonus = getBuildingBonus('copper', getBuildingLevel('copper'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, copperBonus);
            } else if (mat === 'copper') {
                const ironBonus = getBuildingBonus('iron', getBuildingLevel('iron'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, ironBonus);
            } else if (mat === 'iron') {
                const goldBonus = getBuildingBonus('pure_gold', getBuildingLevel('pure_gold'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, goldBonus);
            } else if (mat === 'pure_gold') {
                const diamondBonus = getBuildingBonus('diamond', getBuildingLevel('diamond'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, diamondBonus);
            } else if (mat === 'diamond') {
                const emeraldBonus = getBuildingBonus('emerald', getBuildingLevel('emerald'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, emeraldBonus);
            } else if (mat === 'emerald') {
                const rubyBonus = getBuildingBonus('ruby', getBuildingLevel('ruby'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, rubyBonus);
            } else if (mat === 'ruby') {
                const sapphireBonus = getBuildingBonus('sapphire', getBuildingLevel('sapphire'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, sapphireBonus);
            } else if (mat === 'sapphire') {
                const unobtainiumBonus = getBuildingBonus('unobtainium', getBuildingLevel('unobtainium'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, unobtainiumBonus);
            } else if (mat === 'unobtainium') {
                const prismatiumBonus = getBuildingBonus('prismatium', getBuildingLevel('prismatium'));
                finalMatValue = safeMultiplyBigNum(finalMatValue, prismatiumBonus);
            }
        } catch (e) { console.error(e); }

        bank[mat].mult.set(finalMatValue);
      }
    }
  } catch {}
}

export function getMpValueMultiplierBn() {
  try {
    const { mpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
    return mpValue;
  } catch {
    return BigNum.fromInt(1);
  }
}

export function getRpValueMultiplierBn() {
  try {
    const { rpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
    return rpValue;
  } catch {
    return BigNum.fromInt(1);
  }
}

export function getMagnetLevel() {
  try {
    const { magnetRadius } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
    return magnetRadius || 0;
  } catch {
    return 0;
  }
}

export function registerXpUpgradeEffects() {
  try { initResetSystem(); } catch {}

  syncCurrencyMultipliersFromUpgrades();
  onUpgradesChanged(syncCurrencyMultipliersFromUpgrades);
  try {
    if (typeof document !== 'undefined') {
      document.addEventListener('ccc:buildings:changed', () => {
        syncCurrencyMultipliersFromUpgrades();
      });
    }
  } catch {}


  try {
    addExternalCoinMultiplierProvider(({ baseMultiplier, xpUnlocked }) => {
      try {
        const crystalBonus = getBuildingBonus('crystal', getBuildingLevel('crystal'));
        baseMultiplier = safeMultiplyBigNum(baseMultiplier, crystalBonus);
      } catch {}

      if (!xpUnlocked) return baseMultiplier;
      let result = baseMultiplier instanceof BigNum
        ? baseMultiplier.clone?.() ?? baseMultiplier
        : BigNum.fromAny(baseMultiplier ?? 0);
      
      const { coinValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
      return safeMultiplyBigNum(result, coinValue);
    });
  } catch {}

  try {
    addExternalXpGainMultiplierProvider(({ baseGain, xpUnlocked }) => {
      if (!xpUnlocked) return baseGain;
      let gain = baseGain instanceof BigNum
        ? baseGain.clone?.() ?? baseGain
        : BigNum.fromAny(baseGain ?? 0);
      
      const { xpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
      return safeMultiplyBigNum(gain, xpValue);
    });
  } catch {}

  try {
    addExternalMutationGainMultiplierProvider(({ baseGain, mutationUnlocked }) => {
      if (!mutationUnlocked) return baseGain;
      let gain = baseGain instanceof BigNum
        ? baseGain.clone?.() ?? baseGain
        : BigNum.fromAny(baseGain ?? 0);
      
      const { mpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
      return safeMultiplyBigNum(gain, mpValue);
    });
  } catch {}

  try {
    addExternalFpMultiplierProvider((mult) => {
      const { fpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
      if (!fpValue) return mult;
      return safeMultiplyBigNum(mult, fpValue);
    });
  } catch {}

  try {
    addExternalDpMultiplierProvider((mult) => {
      const { dpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
      let finalDpValue = dpValue;
      if (!finalDpValue) return mult;
      return safeMultiplyBigNum(mult, finalDpValue);
    });
  } catch {}

  syncBookCurrencyMultiplierFromUpgrade();
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      invalidateEffectsCache();
      setTimeout(() => {
        try { syncBookCurrencyMultiplierFromUpgrade(); } catch {}
        try { syncCurrencyMultipliersFromUpgrades(); } catch {}
      }, 0);
    });
    
    window.addEventListener('surge:level:change', () => {
        try { syncCurrencyMultipliersFromUpgrades(); } catch {}
    });
    window.addEventListener('surge:nerf:change', () => {
        try { syncCurrencyMultipliersFromUpgrades(); } catch {}
    });
    window.addEventListener('workshop:change', () => {
        try { syncCurrencyMultipliersFromUpgrades(); } catch {}
    });

    window.addEventListener('lab:node:change', () => {
        try { syncCurrencyMultipliersFromUpgrades(); } catch {}
    });

    window.addEventListener('pp:change', () => {
        try { invalidateEffectsCache(); syncCurrencyMultipliersFromUpgrades(); } catch {}
    });
  }
}
