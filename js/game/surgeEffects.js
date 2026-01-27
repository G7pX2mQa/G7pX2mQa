import { BigNum } from '../util/bigNum.js';
import { bank } from '../util/storage.js';
import { 
  addExternalCoinMultiplierProvider, 
  addExternalXpGainMultiplierProvider,
  getXpState,
  setExternalBookRewardProvider
} from './xpSystem.js';
import { addExternalMutationGainMultiplierProvider } from './mutationSystem.js';
import { getCurrentSurgeLevel } from '../ui/merchantTabs/resetTab.js';
import { registerTick, RateAccumulator } from './gameLoop.js';
import { bigNumFromLog10, approxLog10BigNum } from './upgrades.js';

const BN = BigNum;
const MULTIPLIER = 10;
const LOG10_EXP_0_5 = 0.21714724095; // log10(e^0.5)

let currentMultiplier = BigNum.fromInt(1);
let cachedSurgeLevel = 0n;
let bookRateAccumulator = null;

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
  if (cachedSurgeLevel === Number.POSITIVE_INFINITY) return true;
  
  if (typeof cachedSurgeLevel === 'bigint') {
    return cachedSurgeLevel >= 2n;
  }
  if (typeof cachedSurgeLevel === 'number') {
    return cachedSurgeLevel >= 2;
  }
  return false;
}

export function isSurge3Active() {
  if (cachedSurgeLevel === Infinity || (typeof cachedSurgeLevel === 'string' && cachedSurgeLevel === 'Infinity')) return true;
  if (cachedSurgeLevel === Number.POSITIVE_INFINITY) return true;
  
  if (typeof cachedSurgeLevel === 'bigint') {
    return cachedSurgeLevel >= 3n;
  }
  if (typeof cachedSurgeLevel === 'number') {
    return cachedSurgeLevel >= 3;
  }
  return false;
}

export function isSurge4Active() {
  if (cachedSurgeLevel === Infinity || (typeof cachedSurgeLevel === 'string' && cachedSurgeLevel === 'Infinity')) return true;
  if (cachedSurgeLevel === Number.POSITIVE_INFINITY) return true;
  
  if (typeof cachedSurgeLevel === 'bigint') {
    return cachedSurgeLevel >= 4n;
  }
  if (typeof cachedSurgeLevel === 'number') {
    return cachedSurgeLevel >= 4;
  }
  return false;
}

export function isSurge6Active() {
  if (cachedSurgeLevel === Infinity || (typeof cachedSurgeLevel === 'string' && cachedSurgeLevel === 'Infinity')) return true;
  if (cachedSurgeLevel === Number.POSITIVE_INFINITY) return true;
  
  if (typeof cachedSurgeLevel === 'bigint') {
    return cachedSurgeLevel >= 6n;
  }
  if (typeof cachedSurgeLevel === 'number') {
    return cachedSurgeLevel >= 6;
  }
  return false;
}

export function getSurge6WealthMultipliers() {
  if (!isSurge6Active()) {
      return {
          coins: BigNum.fromInt(1),
          books: BigNum.fromInt(1),
          gold: BigNum.fromInt(1),
          magic: BigNum.fromInt(1),
          total: BigNum.fromInt(1)
      };
  }

  const calc = (amount) => {
      if (!amount) return BigNum.fromInt(1);
      if (amount.isInfinite?.()) return BigNum.fromAny('Infinity');

      const log10 = approxLog10BigNum(amount);
      if (!Number.isFinite(log10)) {
          return BigNum.fromInt(1);
      }
      
      // Formula: 2 ^ (log10(amount) / 3)
      const power = log10 / 3;
      if (power <= 0) return BigNum.fromInt(1);
      
      // 2^power = 10^(power * log10(2))
      const log10Result = power * Math.log10(2);
      return bigNumFromLog10(log10Result);
  };

  const c = calc(bank.coins?.value);
  const b = calc(bank.books?.value);
  const g = calc(bank.gold?.value);
  const m = calc(bank.magic?.value);
  
  let total = c.mulBigNumInteger ? c.mulBigNumInteger(b) : c; 
  total = total.mulBigNumInteger ? total.mulBigNumInteger(g) : total;
  total = total.mulBigNumInteger ? total.mulBigNumInteger(m) : total;
  
  return {
      coins: c,
      books: b,
      gold: g,
      magic: m,
      total
  };
}

export function getBookProductionRate() {
  if (!isSurge3Active()) return BigNum.fromInt(0);
  
  // Formula: max(1, floor(1 * exp(0.50 * xp_level)))
  const xpState = getXpState();
  const xpLevelBn = xpState.xpLevel;
  
  let baseRate;
  if (xpLevelBn.isInfinite?.()) {
     baseRate = BigNum.fromAny('Infinity');
  } else {
     // BigNum-safe logic for 10^(0.217... * xpLevel)
     if (xpLevelBn.cmp(1e16) > 0) {
         // Exponent E = floor(xpLevel * 0.217147...)
         // We can calculate this using BigNum math.
         const logValBn = xpLevelBn.mulDecimal(String(LOG10_EXP_0_5), 18);
         
         // Extract E from logValBn
         // logValBn is roughly the exponent of 10. 
         if (logValBn.cmp(Number.MAX_VALUE) >= 0) {
             baseRate = BigNum.fromAny('Infinity');
         } else {
             try {
                // If logValBn is finite and within Number range, use it for bigNumFromLog10
                const logValNum = Number(logValBn.toScientific());
                if (logValNum === Infinity || !Number.isFinite(logValNum)) {
                    baseRate = BigNum.fromAny('Infinity');
                } else {
                    baseRate = bigNumFromLog10(logValNum);
                }
             } catch {
                 baseRate = BigNum.fromAny('Infinity');
             }
         }
     } else {
         const lvlNum = Number(xpLevelBn.toPlainIntegerString());
         const logVal = lvlNum * LOG10_EXP_0_5;
         baseRate = bigNumFromLog10(logVal);
     }
  }

  // Ensure min 1
  if (baseRate.cmp(1) < 0) baseRate = BigNum.fromInt(1);

  // Apply multipliers
  if (bank.books?.mult) {
    const mult = bank.books.mult.get();
    baseRate = baseRate.mulBigNumInteger(mult);
  }
  return baseRate;
}

function onTick(dt) {
  if (!isSurge3Active()) return;
  if (!bookRateAccumulator) {
    bookRateAccumulator = new RateAccumulator('books', bank);
  }

  const baseRate = getBookProductionRate();

  // Accumulate
  if (baseRate.cmp(1e9) > 0 || baseRate.isInfinite?.()) {
      // Direct add per tick for large numbers, using dt
      // dt might be > 0.05 if lag occurs, but usually 0.05
      const perTick = baseRate.mulDecimal(String(dt), 18);
      if (bank.books) bank.books.add(perTick);
  } else {
      // Use accumulator for small numbers to handle fractional accumulation
      const rateNum = Number(baseRate.toScientific());
      // RateAccumulator expects amount per second
      // We manually update it with variable dt support by bypassing addRate 
      // if RateAccumulator isn't dt-aware, but here we can just do manual accumulation for consistency
      // or assume addRate is fixed step.
      // Ideally we should modify RateAccumulator to take dt, or manually implement it here.
      // Let's implement manual accumulation here for safety and precision.
      
      if (!window.__bookResidue) window.__bookResidue = 0;
      window.__bookResidue += rateNum * dt;
      if (window.__bookResidue >= 1) {
          const whole = Math.floor(window.__bookResidue);
          window.__bookResidue -= whole;
          if (bank.books) bank.books.add(BigNum.fromInt(whole));
      }
  }
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

  addExternalMutationGainMultiplierProvider(({ baseGain }) => {
    if (!isSurge4Active()) return baseGain;
    return baseGain.mulBigNumInteger(BigNum.fromInt(1e12));
  });

  addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
    if (!isSurge6Active()) return baseMultiplier;
    const wealth = getSurge6WealthMultipliers();
    if (wealth.total.cmp(1) <= 0) return baseMultiplier;
    return baseMultiplier.mulBigNumInteger(wealth.total);
  });
  
  // Surge 3: Disable flat Book reward
  setExternalBookRewardProvider(({ baseReward }) => {
     if (isSurge3Active()) {
         return BigNum.fromInt(0);
     }
     return baseReward;
  });

  registerTick(onTick);
}
