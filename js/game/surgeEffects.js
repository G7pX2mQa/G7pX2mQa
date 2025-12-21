import { BigNum } from '../util/bigNum.js';
import { addExternalCoinMultiplierProvider, addExternalXpGainMultiplierProvider } from './xpSystem.js';
import { addExternalMutationGainMultiplierProvider } from './mutationSystem.js';
import { getCurrentSurgeLevel } from '../ui/merchantTabs/resetTab.js';

const BN = BigNum;
const MULTIPLIER = 10;

let currentMultiplier = BigNum.fromInt(1);
let cachedSurgeLevel = 0n;

function updateMultiplier() {
  const level = getCurrentSurgeLevel();
  cachedSurgeLevel = level;
  let isReached = false;
  
  if (level === Infinity) {
    isReached = true;
  } else if (typeof level === 'bigint') {
    isReached = level >= 1n;
  }

  if (isReached) {
    currentMultiplier = BigNum.fromInt(MULTIPLIER);
  } else {
    currentMultiplier = BigNum.fromInt(1);
  }
}

export function isSurge2Active() {
  if (cachedSurgeLevel === Infinity || (typeof cachedSurgeLevel === 'string' && cachedSurgeLevel === 'Infinity')) return true;
  // Handle case where level is numeric Infinity (though usually BigInt or string 'Infinity' from storage)
  if (cachedSurgeLevel === Number.POSITIVE_INFINITY) return true;
  
  if (typeof cachedSurgeLevel === 'bigint') {
    return cachedSurgeLevel >= 2n;
  }
  // Fallback for number type if ever used
  if (typeof cachedSurgeLevel === 'number') {
    return cachedSurgeLevel >= 2;
  }
  return false;
}

export function initSurgeEffects() {
  updateMultiplier();

  if (typeof window !== 'undefined') {
    window.addEventListener('surge:level:change', () => {
      updateMultiplier();
    });
    window.addEventListener('saveSlot:change', () => {
      updateMultiplier();
    });
  }

  addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
    if (currentMultiplier.cmp(BigNum.fromInt(1)) === 0) return baseMultiplier;
    return baseMultiplier.mulBigNumInteger(currentMultiplier);
  });

  addExternalXpGainMultiplierProvider(({ baseGain }) => {
    if (currentMultiplier.cmp(BigNum.fromInt(1)) === 0) return baseGain;
    return baseGain.mulBigNumInteger(currentMultiplier);
  });

  addExternalMutationGainMultiplierProvider(({ baseGain }) => {
    if (currentMultiplier.cmp(BigNum.fromInt(1)) === 0) return baseGain;
    return baseGain.mulBigNumInteger(currentMultiplier);
  });
}
