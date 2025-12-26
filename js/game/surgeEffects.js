import { BigNum } from '../util/bigNum.js';
import { bank } from '../util/storage.js';
import { addExternalCoinMultiplierProvider, addExternalXpGainMultiplierProvider, getXpState } from './xpSystem.js';
import { addExternalMutationGainMultiplierProvider } from './mutationSystem.js';
import { getCurrentSurgeLevel } from '../ui/merchantTabs/resetTab.js';
import { registerTick } from './gameLoop.js';
import { levelBigNumToNumber } from './upgrades.js';

const BN = BigNum;
const MULTIPLIER = 10;

let currentMultiplier = BigNum.fromInt(1);
let cachedSurgeLevel = 0n;
let _bookAccumulator = 0;

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

  registerTick((dt) => {
    // Surge 3: Books generate automatically based on XP Level
    // Formula: books_per_second = max(1, math.floor(1 * math.exp(0.50 * xp_level)))
    let surgeLevel = 0;
    // Use cached level if available to avoid polling storage/DOM every tick
    const sl = cachedSurgeLevel ?? getCurrentSurgeLevel();
    try { 
      if (typeof sl === 'bigint') surgeLevel = Number(sl);
      else if (typeof sl === 'number') surgeLevel = sl;
      else if (sl === Infinity || sl === 'Infinity') surgeLevel = Infinity;
    } catch {}

    if (surgeLevel >= 3) {
      const state = getXpState();
      const xpLevelNum = levelBigNumToNumber(state.xpLevel);
      if (Number.isFinite(xpLevelNum)) {
        const exponent = 0.50 * xpLevelNum;
        let booksPerSecond = 0;
        if (exponent > 709) { // Math.exp limit
           booksPerSecond = Infinity;
        } else {
           booksPerSecond = Math.max(1, Math.floor(1 * Math.exp(exponent)));
        }
        
        let booksToGen;
        if (!Number.isFinite(booksPerSecond)) {
            booksToGen = BigNum.fromAny('Infinity');
        } else {
            // Apply dt - will process below
            booksToGen = null; 
        }

        // Apply book multiplier
        const bookMult = bank?.books?.mult?.get() ?? BigNum.fromInt(1);
        
        if (booksToGen && booksToGen.isInfinite()) {
             if (bank?.books) bank.books.add(booksToGen);
        } else {
             const amount = booksPerSecond * dt;
             
             // If rate is small, use accumulator to avoid flooring to zero
             if (amount < 1 && bookMult.cmp(100) < 0) { 
                 _bookAccumulator += amount;
                 if (_bookAccumulator >= 1) {
                     const whole = Math.floor(_bookAccumulator);
                     _bookAccumulator -= whole;
                     if (bank?.books) bank.books.add(BigNum.fromInt(whole).mulBigNumInteger(bookMult));
                 }
             } else {
                 // Large enough, just add.
                 let baseBn;
                 if (booksPerSecond > 9e15) {
                     baseBn = BigNum.fromAny(booksPerSecond); 
                 } else {
                     baseBn = BigNum.fromAny(booksPerSecond);
                 }
                 
                 const perTick = baseBn.mulDecimal(String(dt));
                 const total = perTick.mulBigNumInteger(bookMult);
                 if (bank?.books) bank.books.add(total);
             }
        }
      }
    }
  });

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
