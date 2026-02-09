import { BigNum } from '../util/bigNum.js';
import { bank } from '../util/storage.js';
import { initResetSystem } from '../ui/merchantTabs/resetTab.js';
import {
  addExternalCoinMultiplierProvider,
  addExternalXpGainMultiplierProvider,
  refreshCoinMultiplierFromXpLevel,
  isXpSystemUnlocked,
} from './xpSystem.js';
import { addExternalMutationGainMultiplierProvider } from './mutationSystem.js';
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

let _cachedUpgradeMultipliers = null;
let listeners = [];

export function invalidateEffectsCache() {
  _cachedUpgradeMultipliers = null;
}

export function triggerUpgradesChanged() {
  _cachedUpgradeMultipliers = null;
  try { listeners.forEach(cb => cb()); } catch {}
  try { document.dispatchEvent(new CustomEvent('ccc:upgrades:changed')); } catch {}
  try { refreshCoinMultiplierFromXpLevel(); } catch {}
}

export function onUpgradesChanged(cb) {
  if (typeof cb === 'function') listeners.push(cb);
  return () => { listeners = listeners.filter(x => x !== cb); };
}

export function bookValueMultiplierBn(level) {
  const L = ensureLevelBigNum(level);
  try {
    const plain = L.toPlainIntegerString?.();
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
    multHandle.set(multiplier.clone?.() ?? multiplier);
  } catch {}
}

export function calculateUpgradeMultipliers(areaKey = AREA_KEYS.STARTER_COVE) {
  if (_cachedUpgradeMultipliers) return _cachedUpgradeMultipliers;

  const upgrades = getUpgradesForArea(areaKey);
  const additionalUpgrades = [];
  if (areaKey === AREA_KEYS.STARTER_COVE && AREA_KEYS.DNA) {
    const dnaUpgrades = getUpgradesForArea(AREA_KEYS.DNA);
    additionalUpgrades.push(...dnaUpgrades);
  }
  const allUpgrades = [...upgrades, ...additionalUpgrades];

  const acc = {
    coinValue: BigNum.fromInt(1),
    xpValue: BigNum.fromInt(1),
    mpValue: BigNum.fromInt(1),
    bookValue: BigNum.fromInt(1),
    coinSpawn: 1.0,
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
      const { selfMult, xpMult, coinMult, mpMult } = computeHmMultipliers(upg, lvlBn, effectiveArea);
      acc.xpValue = safeMultiplyBigNum(acc.xpValue, xpMult);
      acc.coinValue = safeMultiplyBigNum(acc.coinValue, coinMult);
      acc.mpValue = safeMultiplyBigNum(acc.mpValue, mpMult);
      
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
    } else if (upg.effectType === 'coin_value') {
      acc.coinValue = safeMultiplyBigNum(acc.coinValue, baseEffect);
    } else if (upg.effectType === 'xp_value') {
      acc.xpValue = safeMultiplyBigNum(acc.xpValue, baseEffect);
    } else if (upg.effectType === 'mp_value') {
      acc.mpValue = safeMultiplyBigNum(acc.mpValue, baseEffect);
    } else if (upg.effectType === 'book_value') {
      acc.bookValue = safeMultiplyBigNum(acc.bookValue, baseEffect);
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

  _cachedUpgradeMultipliers = acc;
  return acc;
}

export function computeUpgradeEffects(areaKey) {
  const mults = calculateUpgradeMultipliers(areaKey);
  
  return {
    coinsPerSecondMult: mults.coinSpawn,
    coinsPerSecondAbsolute: BASE_CPS * mults.coinSpawn,
    coinValueMultiplier: mults.coinValue,
    xpGainMultiplier: mults.xpValue,
    bookRewardMultiplier: mults.bookValue,
  };
}

export function getMpValueMultiplierBn() {
  try {
    const { mpValue } = calculateUpgradeMultipliers(AREA_KEYS.STARTER_COVE);
    return mpValue;
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

  try {
    addExternalCoinMultiplierProvider(({ baseMultiplier, xpUnlocked }) => {
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

  syncBookCurrencyMultiplierFromUpgrade();
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      try { syncBookCurrencyMultiplierFromUpgrade(); } catch {}
      try { refreshCoinMultiplierFromXpLevel(); } catch {}
    });
  }
}
