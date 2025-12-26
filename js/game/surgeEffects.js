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
import { bigNumFromLog10 } from './upgrades.js';

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

function onTick() {
  if (!isSurge3Active()) return;
  if (!bookRateAccumulator) {
    bookRateAccumulator = new RateAccumulator('books', bank);
  }

  // Formula: max(1, floor(1 * exp(0.50 * xp_level)))
  const xpState = getXpState();
  const xpLevelBn = xpState.xpLevel;
  
  let baseRate;
  if (xpLevelBn.isInfinite?.()) {
     baseRate = BigNum.fromAny('Infinity');
  } else {
     // log10(rate) = 0.217147... * xpLevel
     // If xpLevel is huge, we need BigNum math for the exponent part?
     // bigNumFromLog10 handles up to Number.MAX_VALUE log10.
     // If xpLevel * 0.217... > 1.79e308, we are Infinite.
     
     // 1.79e308 / 0.217 = ~8e308. 
     // So xpLevel fits in BigNum, but we need to convert to number for log math?
     // No, bigNumFromLog10 takes a number. 
     // If xpLevel is > 1e308, the rate is infinite.
     
     if (xpLevelBn.cmp(1e16) > 0) { // arbitrary threshold for "huge"
         // If XP level is > 1e16, rate is 10^(2e15), which is insanely huge but finite in BigNum logic?
         // Wait, BigNum exponent limit is 1.79e308.
         // If xpLevel is 1e16, exponent is 2e15. This fits in 'e'.
         
         // We can construct BigNum manually if needed, but bigNumFromLog10 expects number.
         // Let's use BigNum.fromScientific or similar if we can get the exponent.
         
         // Exponent E = floor(xpLevel * 0.217147...)
         // We can calculate this using BigNum math.
         const factor = BigNum.fromAny(LOG10_EXP_0_5);
         const logValBn = xpLevelBn.mulDecimal(LOG10_EXP_0_5); // BigNum result
         
         // Extract E from logValBn
         // logValBn is roughly the exponent of 10. 
         // Since BigNum stores value as sig * 10^e, we can't just "use" it as an exponent directly 
         // unless we construct a new BigNum with `e = logValBn`.
         
         // But BigNum's 'e' is a standard number (up to 1e308).
         // If logValBn > 1e308, then the result is truly infinite.
         
         if (logValBn.cmp(Number.MAX_VALUE) >= 0) {
             baseRate = BigNum.fromAny('Infinity');
         } else {
             // Safe to convert logValBn to number?
             // It might be e.g. 1e20. Number supports that.
             // But bigNumFromLog10(1e20) would try to do Math.pow(10, 1e20) which is Infinity.
             // Wait, bigNumFromLog10 handles huge logs by returning BigNum with that exponent.
             // `export function bigNumFromLog10(log10Value) { ... }` in upgrades.js
             // Check implementation:
             /*
               if (!Number.isFinite(log10Value)) ...
               if (log10Value <= -1e12) ...
               let intPart = Math.floor(log10Value);
               ...
               const exp = intPart - (p - 1);
               return new BigNum(sig, exp, p);
             */
             // So yes, it handles large log10Value as long as it fits in Number (1e308).
             // If logValBn fits in Number, we are good.
             
             try {
                const logValNum = Number(logValBn.toScientific());
                if (logValNum === Infinity) {
                    baseRate = BigNum.fromAny('Infinity');
                } else {
                    baseRate = bigNumFromLog10(logValNum);
                }
             } catch {
                 baseRate = BigNum.fromAny('Infinity');
             }
         }
     } else {
         // Small enough for standard float math? 
         // 1e16 * 0.217 = 2e15. Math.pow(10, 2e15) is Infinity in JS number.
         // But bigNumFromLog10 handles it.
         // So yes, convert to number and pass to bigNumFromLog10.
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

  // Convert to per-second rate
  // RateAccumulator expects "amount per second".
  // Note: RateAccumulator takes a NUMBER usually? 
  // Let's check RateAccumulator implementation in gameLoop.js.
  /*
    addRate(amountPerSecond) {
        const perTick = amountPerSecond * FIXED_STEP;
        this.buffer += perTick;
        if (this.buffer >= 1) {
          const whole = Math.floor(this.buffer);
          this.buffer -= whole;
          this.bank[this.currencyKey].add(whole);
        }
    }
  */
  // It performs arithmetic on `buffer` (number). `amountPerSecond` is multiplied by `FIXED_STEP` (0.05).
  // If `amountPerSecond` is BigNum, `BigNum * 0.05` -> NaN if not handled.
  // RateAccumulator as implemented seems to support only Numbers?
  // Let's re-read `js/game/gameLoop.js`.
  /*
    addRate(amountPerSecond) {
        const perTick = amountPerSecond * FIXED_STEP; // This implies amountPerSecond is number
        // ...
        if (this.bank && this.bank[this.currencyKey]) {
            this.bank[this.currencyKey].add(whole);
        }
    }
  */
  // Yes, RateAccumulator is for small numbers.
  // We need to handle BigNum rates manually if they are large.
  
  if (baseRate.cmp(1e9) > 0 || baseRate.isInfinite?.()) {
      // Direct add per tick for large numbers
      const perTick = baseRate.mulDecimal('0.05'); // 1/20
      if (bank.books) bank.books.add(perTick);
  } else {
      // Use accumulator for small numbers to handle fractional accumulation
      const rateNum = Number(baseRate.toScientific());
      bookRateAccumulator.addRate(rateNum);
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
  
  // Surge 3: Disable flat Book reward
  setExternalBookRewardProvider(({ baseReward }) => {
     if (isSurge3Active()) {
         return BigNum.fromInt(0);
     }
     return baseReward;
  });

  registerTick(onTick);
}
